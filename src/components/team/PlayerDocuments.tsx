"use client";

import { useState, useEffect, useRef } from "react";
import {
  FileText,
  Upload,
  Trash2,
  Loader2,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const DOC_TYPE_LABELS: Record<string, string> = {
  id_card: "Cartão de Cidadão",
  birth_certificate: "Certidão de Nascimento",
  sports_insurance: "Seguro Desportivo",
  medical_exam: "Exame Médico",
  authorization: "Autorização",
  photo: "Fotografia",
  other: "Outro",
};

const STATUS_STYLES: Record<string, string> = {
  valid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expiring: "bg-amber-50 text-amber-700 border-amber-200",
  expired: "bg-red-50 text-red-700 border-red-200",
  missing: "bg-slate-50 text-slate-500 border-slate-200",
};

interface PlayerDocument {
  id: string;
  player_id: string;
  doc_type: string;
  file_url: string;
  file_name: string | null;
  valid_from: string | null;
  valid_until: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

interface PlayerDocumentsProps {
  playerId: string;
  playerName: string;
  canManage: boolean;
}

export function PlayerDocuments({
  playerId,
  playerName,
  canManage,
}: PlayerDocumentsProps) {
  const [documents, setDocuments] = useState<PlayerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [docType, setDocType] = useState("other");
  const [notes, setNotes] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");

  useEffect(() => {
    void loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  async function loadDocuments() {
    setLoading(true);
    const res = await fetch(`/api/players/${playerId}/documents`);
    const data = await res.json().catch(() => null);
    if (data?.documents) {
      setDocuments(data.documents);
    }
    setLoading(false);
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Seleciona um ficheiro.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("doc_type", docType);
    if (notes) formData.set("notes", notes);
    if (validFrom) formData.set("valid_from", validFrom);
    if (validUntil) formData.set("valid_until", validUntil);

    const res = await fetch(`/api/players/${playerId}/documents`, {
      method: "POST",
      body: formData,
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.success) {
      toast.error(payload?.error || "Erro ao fazer upload.");
    } else {
      toast.success("Documento adicionado");
      setShowForm(false);
      resetForm();
      void loadDocuments();
    }
    setUploading(false);
  }

  async function handleDelete(docId: string) {
    setDeleting(docId);
    const res = await fetch(`/api/players/${playerId}/documents`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: docId }),
    });
    if (res.ok) {
      toast.success("Documento removido");
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } else {
      toast.error("Erro ao remover documento.");
    }
    setDeleting(null);
  }

  function resetForm() {
    setDocType("other");
    setNotes("");
    setValidFrom("");
    setValidUntil("");
    if (fileRef.current) fileRef.current.value = "";
  }

  // Check expiring documents
  const expiringCount = documents.filter((d) => {
    if (!d.valid_until) return false;
    const until = new Date(d.valid_until);
    const now = new Date();
    const daysLeft = (until.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysLeft >= 0 && daysLeft <= 30;
  }).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText size={16} className="text-slate-500" />
            Documentos — {playerName}
          </CardTitle>
          {canManage && !showForm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForm(true)}
            >
              <Upload size={13} className="mr-1" /> Adicionar
            </Button>
          )}
        </div>
        {expiringCount > 0 && (
          <div className="flex items-center gap-1.5 mt-1 text-amber-700 text-xs">
            <AlertTriangle size={12} />
            {expiringCount} documento{expiringCount > 1 ? "s" : ""} a expirar nos próximos 30 dias
          </div>
        )}
      </CardHeader>
      <CardContent>
        {showForm && (
          <div className="mb-4 p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo de documento</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Ficheiro</Label>
                <Input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Válido desde</Label>
                <Input
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Válido até</Label>
                <Input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notas</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas opcionais..."
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => void handleUpload()}
                disabled={uploading}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {uploading ? (
                  <Loader2 size={13} className="mr-1 animate-spin" />
                ) : (
                  <Upload size={13} className="mr-1" />
                )}
                Fazer upload
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                disabled={uploading}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-6">
            <FileText size={28} className="text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Sem documentos registados.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-slate-100 bg-white"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full border ${STATUS_STYLES[doc.status] ?? STATUS_STYLES.valid}`}
                    >
                      {doc.status === "valid" ? "Válido" : doc.status === "expiring" ? "A expirar" : doc.status === "expired" ? "Expirado" : "Em falta"}
                    </span>
                    <span className="text-xs font-medium text-slate-700">
                      {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {doc.file_name ?? "Ficheiro"}
                    {doc.valid_until && (
                      <span className="ml-2">· Válido até {doc.valid_until}</span>
                    )}
                  </p>
                  {doc.notes && (
                    <p className="text-xs text-slate-400 mt-0.5">{doc.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                    title="Abrir ficheiro"
                  >
                    <ExternalLink size={14} />
                  </a>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(doc.id)}
                      disabled={deleting === doc.id}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600"
                      title="Remover"
                    >
                      {deleting === doc.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
