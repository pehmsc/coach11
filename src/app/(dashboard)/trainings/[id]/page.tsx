"use client";

import { useParams } from "next/navigation";
import { TrainingDetailView } from "@/components/trainings/detail/TrainingDetailView";

export default function TrainingDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <TrainingDetailView trainingId={id} />;
}
