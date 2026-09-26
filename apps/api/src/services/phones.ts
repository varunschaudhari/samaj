import { MemberModel } from '../models/member.model';
import { UserModel } from '../models/user.model';
import { AppError } from '../utils/app-error';

/*
 * A mobile number is a sign-in, so it belongs to one account. A number that is
 * listed on a person in a family, but has no account yet, is reserved for that
 * person: they join the family with an invite code instead of starting a
 * second family of their own.
 */

export const phoneTaken = (path = 'phone') =>
  new AppError(409, 'PHONE_TAKEN', 'This mobile number already has an account. Sign in instead.', [
    { path, message: 'validation.phoneTaken' },
  ]);

export const phoneListed = (path = 'phone') =>
  new AppError(
    409,
    'PHONE_LISTED',
    'This mobile number is already listed in a family. Ask the family or your branch committee for an invite code, then use Join your family.',
    [{ path, message: 'validation.phoneListed' }],
  );

/** Throws when the number already signs someone in, or is waiting for someone listed in a family. */
export async function assertPhoneFree(phone: string, path = 'phone'): Promise<void> {
  if (await UserModel.exists({ phone })) throw phoneTaken(path);
  if (await MemberModel.exists({ phone, userId: null })) throw phoneListed(path);
}
