import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import {
  deleteUserAvatarStorage,
  listManagedAgeGroups,
  optionalDeleteByEq,
  optionalUpdateByEq,
} from "@/lib/team/delete-age-group";

type DeleteAccountPayload = {
  confirmation?: string;
};

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as DeleteAccountPayload | null;
    if (body?.confirmation !== "DELETE_ACCOUNT") {
      return NextResponse.json(
        { error: "Confirmação inválida para apagar conta." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const managedAgeGroups = await listManagedAgeGroups(admin, user.id);

    if (managedAgeGroups.length > 0) {
      return NextResponse.json(
        {
          error:
            "Não podes apagar a conta enquanto fores coordenador de um escalão. Apaga primeiro o escalão na área Equipa.",
          managedAgeGroups,
        },
        { status: 409 },
      );
    }

    await optionalDeleteByEq(admin, "team_staff", "profile_id", user.id);
    await optionalDeleteByEq(admin, "staff_invites", "profile_id", user.id);
    await optionalDeleteByEq(admin, "staff_invites", "invited_by", user.id);
    await optionalDeleteByEq(admin, "staff_invites", "accepted_by", user.id);
    await optionalDeleteByEq(admin, "beta_invites", "created_by_profile_id", user.id);
    await optionalDeleteByEq(admin, "public_share_tokens", "created_by", user.id);

    await optionalUpdateByEq(admin, "players", "profile_id", user.id, { profile_id: null });
    await optionalUpdateByEq(admin, "training_attendance", "marked_by", user.id, {
      marked_by: null,
    });
    await optionalUpdateByEq(admin, "attendance_records", "marked_by", user.id, {
      marked_by: null,
    });
    await optionalUpdateByEq(admin, "grounds", "created_by", user.id, { created_by: null });
    await optionalUpdateByEq(admin, "game_live_checkpoints", "updated_by", user.id, {
      updated_by: null,
    });

    await deleteUserAvatarStorage(admin, user.id);

    const { error: deleteProfileError } = await admin
      .from("profiles")
      .delete()
      .eq("id", user.id);

    if (deleteProfileError) {
      return respondInternalError("api.me.account.delete.profile", deleteProfileError);
    }

    const { error: deleteAuthUserError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteAuthUserError) {
      return respondInternalError("api.me.account.delete.auth-user", deleteAuthUserError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.me.account.delete", error);
  }
}
