import { useState } from "react";
import { MediaItem } from "@/lib/types";
import { useUpdateItem } from "@/hooks/useMediaItems";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, Check, X, Disc, Package, HardDrive, Shield } from "lucide-react";
import { DiscEditor, DiscEntry } from "@/components/DiscEditor";
const CASE_TYPES = ["Regular", "Steelbook", "Digipack", "Slipcase", "Box Set", "Unique/Custom"];
const CONDITIONS = ["Mint", "Near Mint", "Good", "Fair", "Poor"];
const DIGITAL_CODE_STATUSES = ["Not Included", "Included (Unused)", "Redeemed", "Expired"];
const RIP_STATUSES = ["Not Ripped", "Ripped", "Unrippable"];

interface PhysicalMediaDetailsProps {
  item: MediaItem;
}

type MetadataFields = {
  edition?: string;
  case_type?: string;
  discs?: DiscEntry[];
  condition?: string;
  slipcover?: string;
  digital_code_status?: string;
  digital_code_platform?: string;
  rip_status?: string;
  rip_notes?: string;
  physical_notes?: string;
  distributor?: string;
  region?: string;
  disc_layers?: string;
};

function getMetadata(item: MediaItem): MetadataFields {
  const raw = item.metadata;
  if (!raw || typeof raw !== "object") return {};
  return raw as MetadataFields;
}

export function PhysicalMediaDetails({ item }: PhysicalMediaDetailsProps) {
  const [editing, setEditing] = useState(false);
  const updateItem = useUpdateItem();
  const meta = getMetadata(item);

  const [draft, setDraft] = useState<MetadataFields>({});

  const startEditing = () => {
    setDraft({ ...meta });
    setEditing(true);
  };

  const handleSave = async () => {
    try {
      const currentMeta = (item as any).metadata || {};
      const merged = { ...currentMeta, ...draft };
      // Clean empty strings (but keep arrays)
      Object.keys(merged).forEach((k) => {
        if (merged[k] === "" || merged[k] === undefined) delete merged[k];
      });
      // Derive formats from discs
      const updatePayload: any = { id: item.id, metadata: merged };
      if (draft.discs && draft.discs.length > 0) {
        const discFormats = [...new Set(draft.discs.filter(d => !d.missing).map(d => d.format))];
        if (discFormats.length > 0) {
          updatePayload.formats = discFormats;
          updatePayload.format = discFormats[0];
        }
      }
      await updateItem.mutateAsync(updatePayload);
      toast({ title: "Details saved!" });
      setEditing(false);
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const updateField = (key: keyof MetadataFields, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const hasAnyData = meta.edition || meta.case_type || (meta.discs && meta.discs.length > 0) || meta.condition || meta.rip_status || meta.distributor || meta.region || meta.disc_layers;

  if (!editing && !hasAnyData) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
          <Disc className="w-3 h-3" /> Physical Details
        </p>
        <Button variant="outline" size="sm" onClick={startEditing} className="gap-1.5 text-xs">
          <Pencil className="w-3 h-3" /> Add physical media details
        </Button>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
            <Disc className="w-3 h-3" /> Physical Details
          </p>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={startEditing}>
            <Pencil className="w-3 h-3 text-muted-foreground" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          {meta.edition && <DetailRow label="Edition" value={meta.edition} />}
          {meta.case_type && <DetailRow label="Case" value={meta.case_type} />}
          {meta.slipcover && <DetailRow label="Slipcover" value={meta.slipcover === "yes" ? "Yes" : "No"} />}
          {meta.condition && (
            <DetailRow label="Condition" value={meta.condition}>
              <ConditionBadge condition={meta.condition} />
            </DetailRow>
          )}
          {meta.discs && meta.discs.length > 0 && (
            <div className="col-span-2">
              <DiscEditor discs={meta.discs} onChange={() => {}} readOnly />
            </div>
          )}
          {meta.digital_code_status && meta.digital_code_status !== "Not Included" && (
            <DetailRow
              label="Digital Code"
              value={`${meta.digital_code_status}${meta.digital_code_platform ? ` — ${meta.digital_code_platform}` : ""}`}
              fullWidth
            />
          )}
          {meta.rip_status && meta.rip_status !== "Not Ripped" && (
            <DetailRow label="Rip Status" value={meta.rip_status} fullWidth warn={meta.rip_status === "Unrippable"}>
              {meta.rip_status === "Ripped" && <HardDrive className="w-3 h-3 text-success inline" />}
              {meta.rip_status === "Unrippable" && <Shield className="w-3 h-3 text-destructive inline" />}
            </DetailRow>
          )}
          {meta.rip_notes && <DetailRow label="Rip Notes" value={meta.rip_notes} fullWidth />}
          {meta.distributor && <DetailRow label="Distributor" value={meta.distributor} />}
          {meta.region && <DetailRow label="Region" value={meta.region} />}
          {meta.disc_layers && <DetailRow label="Layers" value={meta.disc_layers} />}
          {meta.physical_notes && <DetailRow label="Notes" value={meta.physical_notes} fullWidth />}
        </div>
      </div>
    );
  }

  // Editing mode
  const d = draft;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
          <Disc className="w-3 h-3" /> Physical Details
        </p>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave} disabled={updateItem.isPending}>
            <Check className="w-4 h-4 text-success" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(false)}>
            <X className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {/* Edition */}
        <Field label="Edition">
          <Input
            value={d.edition || ""}
            onChange={(e) => updateField("edition", e.target.value)}
            placeholder="e.g. Limited Edition, Special Edition, Criterion…"
            className="h-8 text-sm"
          />
        </Field>

        {/* Case Type */}
        <Field label="Case Type">
          <Select value={d.case_type || "none"} onValueChange={(v) => updateField("case_type", v === "none" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not set</SelectItem>
              {CASE_TYPES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/* Slipcover */}
        <Field label="Slipcover Included?">
          <Select value={d.slipcover || "none"} onValueChange={(v) => updateField("slipcover", v === "none" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not set</SelectItem>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {/* Condition */}
        <Field label="Condition">
          <Select value={d.condition || "none"} onValueChange={(v) => updateField("condition", v === "none" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not set</SelectItem>
              {CONDITIONS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/* Discs */}
        <DiscEditor
          discs={d.discs || []}
          onChange={(discs) => setDraft((prev) => ({ ...prev, discs }))}
        />

        {/* Digital Code */}
        <Field label="Digital Code">
          <Select value={d.digital_code_status || "none"} onValueChange={(v) => updateField("digital_code_status", v === "none" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not set</SelectItem>
              {DIGITAL_CODE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {(d.digital_code_status === "Redeemed" || d.digital_code_status === "Included (Unused)") && (
          <Field label="Redeemed On">
            <Input
              value={d.digital_code_platform || ""}
              onChange={(e) => updateField("digital_code_platform", e.target.value)}
              placeholder="e.g. Movies Anywhere, Vudu, iTunes…"
              className="h-8 text-sm"
            />
          </Field>
        )}

        {/* Rip Status */}
        <Field label="Rip Status">
          <Select value={d.rip_status || "none"} onValueChange={(v) => updateField("rip_status", v === "none" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not set</SelectItem>
              {RIP_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {(d.rip_status === "Unrippable" || d.rip_status === "Ripped") && (
          <Field label="Rip Notes">
            <Textarea
              value={d.rip_notes || ""}
              onChange={(e) => updateField("rip_notes", e.target.value)}
              placeholder={d.rip_status === "Unrippable" ? "e.g. Scratched disc, factory defect…" : "e.g. MakeMKV, HandBrake settings…"}
              rows={2}
              className="text-sm"
            />
          </Field>
        )}

        {/* Distributor */}
        <Field label="Distributor">
          <Input
            value={d.distributor || ""}
            onChange={(e) => updateField("distributor", e.target.value)}
            placeholder="e.g. Universal Studios, Warner Bros…"
            className="h-8 text-sm"
          />
        </Field>

        {/* Region */}
        <Field label="Region">
          <Select value={d.region || "none"} onValueChange={(v) => updateField("region", v === "none" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not set</SelectItem>
              <SelectItem value="Region A/1">Region A/1 (Americas, East Asia)</SelectItem>
              <SelectItem value="Region B/2">Region B/2 (Europe, Africa, Oceania)</SelectItem>
              <SelectItem value="Region C/3">Region C/3 (Asia, Russia)</SelectItem>
              <SelectItem value="Region Free">Region Free</SelectItem>
              <SelectItem value="Region 1">Region 1 (DVD - US/Canada)</SelectItem>
              <SelectItem value="Region 2">Region 2 (DVD - Europe/Japan)</SelectItem>
              <SelectItem value="Region 4">Region 4 (DVD - Oceania/Latin America)</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {/* Disc Layers */}
        <Field label="Disc Layers">
          <Select value={d.disc_layers || "none"} onValueChange={(v) => updateField("disc_layers", v === "none" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not set</SelectItem>
              <SelectItem value="Single side, Single layer">Single side, Single layer</SelectItem>
              <SelectItem value="Single side, Dual layer">Single side, Dual layer</SelectItem>
              <SelectItem value="Dual side, Single layer">Dual side, Single layer</SelectItem>
              <SelectItem value="Dual side, Dual layer">Dual side, Dual layer</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {/* Additional physical notes */}
        <Field label="Additional Notes">
          <Textarea
            value={d.physical_notes || ""}
            onChange={(e) => updateField("physical_notes", e.target.value)}
            placeholder="Any other notes about this copy…"
            rows={2}
            className="text-sm"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground font-medium">{label}</label>
      {children}
    </div>
  );
}

function DetailRow({
  label,
  value,
  fullWidth,
  warn,
  children,
}: {
  label: string;
  value: string;
  fullWidth?: boolean;
  warn?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={fullWidth ? "col-span-2" : ""}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className={`text-sm ${warn ? "text-destructive" : "text-foreground"} flex items-center gap-1`}>
        {children}
        {value}
      </p>
    </div>
  );
}

function ConditionBadge({ condition }: { condition: string }) {
  const colorMap: Record<string, string> = {
    Mint: "bg-success/20 text-success border-success/30",
    "Near Mint": "bg-success/10 text-success border-success/20",
    Good: "bg-primary/10 text-primary border-primary/20",
    Fair: "bg-warning/10 text-warning border-warning/20",
    Poor: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${colorMap[condition] || ""}`}>
      {condition}
    </Badge>
  );
}
