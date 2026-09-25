'use server';

import * as auth from '@thippo/auth/actions';

// @thippo/auth の処理をこのアプリ用に束ねた Server Action

export async function signInAction(prev: auth.FormState, formData: FormData) {
  return auth.signIn('host', prev, formData);
}

export async function signOutAction() {
  await auth.signOut('host');
}

export async function requestPasswordResetAction(prev: auth.FormState, formData: FormData) {
  return auth.requestPasswordReset('host', prev, formData);
}

export async function resetPasswordAction(prev: auth.FormState, formData: FormData) {
  return auth.resetPassword('host', prev, formData);
}
