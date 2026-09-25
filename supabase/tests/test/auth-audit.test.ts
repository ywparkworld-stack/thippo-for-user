import { describe, expect, it } from 'vitest';
import { adminPool, anon, as, createUser, expectPgError, serviceRole, user } from '../src/db';
import { randomUUID } from 'node:crypto';

describe('rate_limit_hit', () => {
  it('上限を超えると allowed = false', async () => {
    const key = `test:${randomUUID()}`;
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await as(serviceRole, async (c) => {
        const { rows } = await c.query('select * from public.rate_limit_hit($1, 3, 600)', [key]);
        await c.query('commit');
        return rows[0];
      });
      results.push(r.allowed);
    }
    expect(results).toEqual([true, true, true, false]);
  });

  it('同時に呼ばれても回数を取りこぼさない', async () => {
    const key = `test:${randomUUID()}`;
    await Promise.all(
      Array.from({ length: 20 }, () =>
        adminPool.query('select public.rate_limit_hit($1, 100, 600)', [key]),
      ),
    );
    const { rows } = await adminPool.query(
      'select sum(count)::int as n from public.rate_limits where key = $1',
      [key],
    );
    expect(rows[0].n).toBe(20);
  });

  it('利用者や未ログインでは呼べない（回数を消されたり増やされたりしない）', async () => {
    const guest = await createUser();
    for (const actor of [anon, user(guest)]) {
      await as(actor, async (c) => {
        await expectPgError(c.query(`select public.rate_limit_hit('x', 1, 60)`), '42501');
      });
      await as(actor, async (c) => {
        await expectPgError(c.query(`select * from public.rate_limits`), '42501');
      });
    }
  });
});

describe('操作ログの記録', () => {
  it('運営（aal2）は自分を actor として記録できる', async () => {
    const admin = await createUser({ role: 'admin' });
    await as(user(admin, 'aal2'), async (c) => {
      const { rows } = await c.query(
        `select public.log_admin_action('identity.approve', 'identity_documents', 'doc-1', '{"a":1}') as id`,
      );
      const log = await c.query(
        'select actor_id, action, target_id, payload from public.audit_logs where id = $1',
        [rows[0].id],
      );
      expect(log.rows[0]).toEqual({
        actor_id: admin,
        action: 'identity.approve',
        target_id: 'doc-1',
        payload: { a: 1 },
      });
    });
  });

  it('2段階認証をしていない admin・利用者・貸出主は記録できない', async () => {
    const admin = await createUser({ role: 'admin' });
    const guest = await createUser();
    const host = await createUser({ role: 'host' });
    for (const actor of [user(admin, 'aal1'), user(guest, 'aal2'), user(host, 'aal2')]) {
      await as(actor, async (c) => {
        await expectPgError(c.query(`select public.log_admin_action('identity.approve')`), '42501');
      });
    }
    await as(anon, async (c) => {
      await expectPgError(c.query(`select public.log_admin_action('identity.approve')`), '42501');
    });
  });

  it('actor を指定して記録する関数は service role だけが呼べる', async () => {
    const admin = await createUser({ role: 'admin' });
    await as(user(admin, 'aal2'), async (c) => {
      await expectPgError(
        c.query(`select public.write_audit_log($1, 'admin.login')`, [admin]),
        '42501',
      );
    });
    await as(serviceRole, async (c) => {
      const { rows } = await c.query(
        `select public.write_audit_log($1, 'admin.login', null, null, '{"ip":"x"}') as id`,
        [admin],
      );
      expect(Number(rows[0].id)).toBeGreaterThan(0);
    });
  });

  it('action は「対象.操作」の形式', async () => {
    await expectPgError(
      adminPool.query(`select public.write_audit_log(null, 'Bad Action')`),
      '23514',
    );
  });
});
