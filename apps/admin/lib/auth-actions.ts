'use server';

import * as auth from '@thippo/auth/actions';

// @thippo/auth の処理をこのアプリ用に束ねた Server Action

export async function signInAction(prev: auth.FormState, formData: FormData) {
  return auth.signIn('admin', prev, formData);
}

export async function signOutAction() {
  await auth.signOut('admin');
}

export async function requestPasswordResetAction(prev: auth.FormState, formData: FormData) {
  return auth.requestPasswordReset('admin', prev, formData);
}

export async function resetPasswordAction(prev: auth.FormState, formData: FormData) {
  return auth.resetPassword('admin', prev, formData);
}

export async function startTotpEnrollmentAction() {
  return auth.startTotpEnrollment();
}

export async function verifyTotpEnrollmentAction(prev: auth.FormState, formData: FormData) {
  return auth.verifyTotp('mfa_enroll', prev, formData);
}

export async function verifyTotpChallengeAction(prev: auth.FormState, formData: FormData) {
  return auth.verifyTotp('mfa_verify', prev, formData);
}
