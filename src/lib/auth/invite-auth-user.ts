import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function findAuthUserByEmail(
  admin: AdminClient,
  email: string,
) {
  const normalizedEmail = normalizeEmail(email);
  let page = 1;
  const perPage = 200;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const users = data?.users || [];
    const foundUser =
      users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail) ||
      null;

    if (foundUser) return foundUser;
    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

export async function ensureInviteAuthUser(
  admin: AdminClient,
  params: {
    email: string;
    fullName: string;
    role: "coordinator" | "coach";
  },
) {
  const existingUser = await findAuthUserByEmail(admin, params.email);
  if (existingUser) {
    await admin.auth.admin.updateUserById(existingUser.id, {
      email_confirm: true,
      user_metadata: {
        ...(existingUser.user_metadata || {}),
        full_name: params.fullName,
        role: params.role,
      },
    });
    return existingUser;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: params.email,
    password: `${crypto.randomUUID()}Aa1!`,
    email_confirm: true,
    user_metadata: {
      full_name: params.fullName,
      role: params.role,
    },
  });

  if (error || !data.user) {
    throw error || new Error("invite_auth_user_create_failed");
  }

  return data.user;
}

export async function upsertInviteAuthCredentials(
  admin: AdminClient,
  params: {
    email: string;
    password: string;
    fullName: string;
    role: "coordinator" | "coach";
  },
) {
  const existingUser = await findAuthUserByEmail(admin, params.email);
  if (existingUser) {
    const { data, error } = await admin.auth.admin.updateUserById(existingUser.id, {
      password: params.password,
      email_confirm: true,
      user_metadata: {
        ...(existingUser.user_metadata || {}),
        full_name: params.fullName,
        role: params.role,
      },
    });

    if (error || !data.user) {
      throw error || new Error("invite_auth_user_update_failed");
    }

    return {
      user: data.user as User,
      created: false,
    };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    user_metadata: {
      full_name: params.fullName,
      role: params.role,
    },
  });

  if (error || !data.user) {
    throw error || new Error("invite_auth_user_create_failed");
  }

  return {
    user: data.user as User,
    created: true,
  };
}
