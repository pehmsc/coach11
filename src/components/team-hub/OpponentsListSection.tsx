"use client";

import { OpponentsTab } from "@/components/opponents/OpponentsTab";

type Props = {
  ageGroupId: string;
};

export function OpponentsListSection({ ageGroupId }: Props) {
  return <OpponentsTab ageGroupId={ageGroupId} />;
}
