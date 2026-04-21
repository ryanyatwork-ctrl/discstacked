import { useMemo, useState } from "react";
import { MediaItem } from "@/lib/types";
import { getEditionLabel } from "@/lib/edition-utils";
import { useUpdateItem } from "@/hooks/useMediaItems";
import { usePhysicalProductsForItem, useUpdatePhysicalProduct } from "@/hooks/usePhysicalProducts";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, Check, X, Disc, HardDrive, Shield } from "lucide-react";
import { DiscEditor } from "@/components/DiscEditor";
import {
  CASE_TYPES,
  CONDITIONS,
  DIGITAL_CODE_STATUSES,
  OBI_STATUSES,
  PACKAGE_COMPONENT_CONDITIONS,
  RIP_STATUSES,
  SLIPCOVER_STATUSES,
  digitalCodeStatusProvidesAccess,
  type DiscEntry,
} from "@/lib/collector-utils";

interface PhysicalMediaDetailsProps {
  item: MediaItem;
}

type MetadataFields = {
  edition?: string | Record<string, any>;
  case_type?: string;
  discs?: DiscEntry[];
  condition?: string;
  sleeved?: boolean;
  slipcover?: string;
  slipcover_status?: string;
  obi_status?: string;
  digital_code_status?: string;
  digital_code_platform?: string;
  rip_status?: string;
  rip_notes?: string;
  physical_notes?: string;
  distributor?: string;
  region?: string;
  disc_layers?: string;
  former_rental?: boolean;
  upgrade_target?: boolean;
  case_condition?: string;
  booklet_condition?: string;
  traycard_condition?: string;
};

function getMetadataFields(input: unknown): MetadataFields {
  if (!input || typeof input !== "object") return {};
  return { ...(input as MetadataFields) };
}

function normalizeMetadataForDisplay(metadata: MetadataFields) {
  const editionObject = metadata.edition && typeof metadata.edition === "object" ? metadata.edition as Record<string, any> : {};
  const editionLabel = typeof metadata.edition === "string"
    ? metadata.edition
    : getEditionLabel(metadata as Record<string, any>) || undefined;
  const slipcoverStatus = metadata.slipcover_status
    || (metadata.slipcover === "yes" ? "included" : metadata.slipcover === "no" ? "missing" : "unknown");

  return {
    ...metadata,
    editionLabel,
    editionObject,
    packageTitle: editionObject.package_title || editionObject.barcode_title || undefined,
    expectedFormats: Array.isArray(editionObject.formats) ? editionObject.formats : [],
    expectedDiscCount: editionObject.disc_count ?? null,
    slipcoverStatus,
    obiStatus: metadata.obi_status || "unknown",
  };
}

export function PhysicalMediaDetails({ item }: PhysicalMediaDetailsProps) {
  const [editing, setEditing] = useState(false);
  const updateItem = useUpdateItem();
  const updatePhysicalProduct = useUpdatePhysicalProduct();
  const { data: physicalProducts = [] } = usePhysicalProductsForItem(item.id);
  const primaryProduct = physicalProducts[0];

  const meta = useMemo(() => {
    const itemMeta = getMetadataFields(item.metadata);
    const productMeta = getMetadataFields(primaryProduct?.metadata);
    return normalizeMetadataForDisplay({ ...itemMeta, ...productMeta });
  }, [item.metadata, primaryProduct?.metadata]);

  const [draft, setDraft] = useState<MetadataFields>({});

  const startEditing = () => {
    setDraft({
      ...meta,
      edition: {
        ...(meta.editionObject || {}),
      },
      discs: meta.discs ? [...meta.discs] : [],
    });
    setEditing(true);
  };

  const updateField = (key: keyof MetadataFields, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      const currentMeta = getMetadataFields(item.metadata);
      const currentProductMeta = getMetadataFields(primaryProduct?.metadata);
      const merged: Record<string, any> = { ...currentMeta, ...currentProductMeta, ...draft };
      const editionObject = {
        ...((currentMeta.edition && typeof currentMeta.edition === "object") ? currentMeta.edition as Record<string, any> : {}),
        ...((currentProductMeta.edition && typeof currentProductMeta.edition === "object") ? currentProductMeta.edition as Record<string, any> : {}),
        ...((draft.edition && typeof draft.edition === "object") ? draft.edition as Record<string, any> : {}),
      };

      if (Object.keys(editionObject).length > 0) {
        merged.edition = editionObject;
      } else if (typeof draft.edition === "string" && draft.edition.trim()) {
        merged.edition = draft.edition.trim();
      }

      if (merged.slipcover) delete merged.slipcover;

      Object.keys(merged).forEach((key) => {
        if (merged[key] === "" || merged[key] === undefined) delete merged[key];
      });

      const discFormats = Array.isArray(merged.discs)
        ? [...new Set(merged.discs.filter((disc: DiscEntry) => !disc.missing).map((disc: DiscEntry) => disc.format))]
        : [];

      if (merged.edition && typeof merged.edition === "object") {
        if (discFormats.length > 0) {
          merged.edition.formats = discFormats;
        }
        if (Array.isArray(merged.discs) && merged.discs.length > 0) {
          merged.edition.disc_count = merged.discs.length;
        }
      }

      const updatePayload: any = {
        id: item.id,
        metadata: merged,
        digital_copy: digitalCodeStatusProvidesAccess(merged.digital_code_status),
      };

      if (discFormats.length > 0) {
        updatePayload.formats = discFormats;
        updatePayload.format = discFormats[0];
      }

      await updateItem.mutateAsync(updatePayload);

      if (primaryProduct) {
        await updatePhysicalProduct.mutateAsync({
          id: primaryProduct.id,
          metadata: merged,
          disc_count: merged.edition?.disc_count || merged.discs?.length || primaryProduct.disc_count || 1,
          formats: discFormats.length > 0 ? discFormats : primaryProduct.formats,
          product_title: merged.edition?.package_title || primaryProduct.product_title,
        } as any);
      }

      toast({ title: "Details saved!" });
      setEditing(false);
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const hasAnyData =
    meta.editionLabel ||
    meta.packageTitle ||
    meta.case_type ||
    (meta.discs && meta.discs.length > 0) ||
    meta.condition ||
    meta.rip_status ||
    meta.distributor ||
    meta.region ||
    meta.disc_layers ||
    meta.former_rental ||
    meta.upgrade_target ||
    (meta.expectedFormats && meta.expectedFormats.length > 0) ||
    meta.expectedDiscCount ||
    meta.sleeved ||
    meta.obi_status ||
    meta.case_condition ||
    meta.booklet_condition ||
    meta.traycard_condition;

  if (!editing && !hasAnyData) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
          <Disc className="w-3 h-3" /> Physical Details
        </p>
        <Button variant="outline" size="sm" onClick={startEditing} className="gap-1.5 text-xs">
          <Pencil className="w-3 h-3" /> Add collector details
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
          {meta.packageTitle && <DetailRow label="Package" value={meta.packageTitle} fullWidth />}
          {meta.editionLabel && <DetailRow label="Edition" value={meta.editionLabel} fullWidth />}
          {meta.expectedFormats?.length > 0 && <DetailRow label="Expected Formats" value={meta.expectedFormats.join(", ")} fullWidth />}
          {meta.expectedDiscCount && <DetailRow label="Expected Disc Count" value={String(meta.expectedDiscCount)} />}
          {meta.former_rental ? <DetailRow label="Former Rental" value="Yes" /> : null}
          {meta.upgrade_target ? <DetailRow label="Upgrade Target" value="Yes" /> : null}
          {meta.sleeved ? <DetailRow label="Sleeved" value="Yes" /> : null}
          {meta.case_type && <DetailRow label="Case" value={meta.case_type} />}
          {meta.slipcoverStatus && <DetailRow label="Slipcover" value={toSlipcoverLabel(meta.slipcoverStatus)} />}
          {meta.obiStatus && meta.obiStatus !== "unknown" && <DetailRow label="OBI" value={toObiLabel(meta.obiStatus)} />}
          {meta.condition && (
            <DetailRow label="Condition" value={meta.condition}>
              <ConditionBadge condition={meta.condition} />
            </DetailRow>
          )}
          {meta.case_condition && meta.case_condition !== "Unknown" && <DetailRow label="Case Condition" value={meta.case_condition} />}
          {meta.booklet_condition && meta.booklet_condition !== "Unknown" && <DetailRow label="Booklet Condition" value={meta.booklet_condition} />}
          {meta.traycard_condition && meta.traycard_condition !== "Unknown" && <DetailRow label="Traycard Condition" value={meta.traycard_condition} />}
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

  const draftEdition = draft.edition && typeof draft.edition === "object" ? draft.edition as Record<string, any> : {};

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
          <Disc className="w-3 h-3" /> Physical Details
        </p>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave} disabled={updateItem.isPending || updatePhysicalProduct.isPending}>
            <Check className="w-4 h-4 text-success" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(false)}>
            <X className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <Field label="Package Title">
          <Input
            value={(draftEdition.package_title as string) || ""}
            onChange={(e) => setDraft((prev) => ({ ...prev, edition: { ...draftEdition, package_title: e.target.value } }))}
            placeholder="Exact package title from the scan or cover"
            className="h-8 text-sm"
          />
        </Field>

        <Field label="Edition Label">
          <Input
            value={(draftEdition.label as string) || ""}
            onChange={(e) => setDraft((prev) => ({ ...prev, edition: { ...draftEdition, label: e.target.value } }))}
            placeholder="e.g. Blu-ray + Digital Code, Ultimate Trilogy, Steelbook"
            className="h-8 text-sm"
          />
        </Field>

        <Field label="Expected Disc Count">
          <Input
            value={draftEdition.disc_count != null ? String(draftEdition.disc_count) : ""}
            onChange={(e) => {
              const value = e.target.value.trim();
              setDraft((prev) => ({
                ...prev,
                edition: { ...draftEdition, disc_count: value ? Number(value) : null },
              }));
            }}
            placeholder="e.g. 1, 2, 4"
            className="h-8 text-sm"
            type="number"
            min={0}
          />
        </Field>

        <Field label="Case Type">
          <Select value={draft.case_type || "none"} onValueChange={(value) => updateField("case_type", value === "none" ? "" : value)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not set</SelectItem>
              {CASE_TYPES.map((caseType) => (
                <SelectItem key={caseType} value={caseType}>{caseType}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <ToggleField
            label="Former Rental"
            checked={!!draft.former_rental}
            onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, former_rental: checked }))}
          />
          <ToggleField
            label="Upgrade Target"
            checked={!!draft.upgrade_target}
            onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, upgrade_target: checked }))}
          />
        </div>

        <ToggleField
          label="Sleeved / Removed From Jewel Case"
          checked={!!draft.sleeved}
          onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, sleeved: checked }))}
        />

        <Field label="Slipcover / Sleeve">
          <Select value={draft.slipcover_status || "unknown"} onValueChange={(value) => updateField("slipcover_status", value)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {SLIPCOVER_STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="OBI">
          <Select value={draft.obi_status || "unknown"} onValueChange={(value) => updateField("obi_status", value)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {OBI_STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Condition">
          <Select value={draft.condition || "none"} onValueChange={(value) => updateField("condition", value === "none" ? "" : value)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not set</SelectItem>
              {CONDITIONS.map((condition) => (
                <SelectItem key={condition} value={condition}>{condition}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Case Condition">
            <Select value={draft.case_condition || "Unknown"} onValueChange={(value) => updateField("case_condition", value)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {PACKAGE_COMPONENT_CONDITIONS.map((condition) => (
                  <SelectItem key={condition} value={condition}>{condition}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Booklet Condition">
            <Select value={draft.booklet_condition || "Unknown"} onValueChange={(value) => updateField("booklet_condition", value)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {PACKAGE_COMPONENT_CONDITIONS.map((condition) => (
                  <SelectItem key={condition} value={condition}>{condition}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Traycard Condition">
            <Select value={draft.traycard_condition || "Unknown"} onValueChange={(value) => updateField("traycard_condition", value)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {PACKAGE_COMPONENT_CONDITIONS.map((condition) => (
                  <SelectItem key={condition} value={condition}>{condition}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <DiscEditor
          discs={draft.discs || []}
          onChange={(discs) => setDraft((prev) => ({ ...prev, discs }))}
        />

        <Field label="Digital Code">
          <Select value={draft.digital_code_status || "Unknown"} onValueChange={(value) => updateField("digital_code_status", value)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {DIGITAL_CODE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>{status}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {(draft.digital_code_status === "Included (Unused)" || draft.digital_code_status === "Used / Redeemed") && (
          <Field label="Digital Platform">
            <Input
              value={draft.digital_code_platform || ""}
              onChange={(e) => updateField("digital_code_platform", e.target.value)}
              placeholder="e.g. Movies Anywhere, Vudu, iTunes"
              className="h-8 text-sm"
            />
          </Field>
        )}

        <Field label="Rip Status">
          <Select value={draft.rip_status || "none"} onValueChange={(value) => updateField("rip_status", value === "none" ? "" : value)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not set</SelectItem>
              {RIP_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>{status}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {(draft.rip_status === "Unrippable" || draft.rip_status === "Ripped") && (
          <Field label="Rip Notes">
            <Textarea
              value={draft.rip_notes || ""}
              onChange={(e) => updateField("rip_notes", e.target.value)}
              placeholder={draft.rip_status === "Unrippable" ? "e.g. Scratched disc, unreadable segment…" : "e.g. MakeMKV, Plex rip complete…"}
              rows={2}
              className="text-sm"
            />
          </Field>
        )}

        <Field label="Distributor">
          <Input
            value={draft.distributor || ""}
            onChange={(e) => updateField("distributor", e.target.value)}
            placeholder="e.g. Universal, Warner Bros., Paramount"
            className="h-8 text-sm"
          />
        </Field>

        <Field label="Region">
          <Input
            value={draft.region || ""}
            onChange={(e) => updateField("region", e.target.value)}
            placeholder="e.g. Region A, Region 1, Region Free"
            className="h-8 text-sm"
          />
        </Field>

        <Field label="Disc Layers">
          <Input
            value={draft.disc_layers || ""}
            onChange={(e) => updateField("disc_layers", e.target.value)}
            placeholder="e.g. Single side, dual layer"
            className="h-8 text-sm"
          />
        </Field>

        <Field label="Additional Notes">
          <Textarea
            value={draft.physical_notes || ""}
            onChange={(e) => updateField("physical_notes", e.target.value)}
            placeholder="Slipcover wear, thrift-store sticker residue, booklet missing, replacement disc needed…"
            rows={2}
            className="text-sm"
          />
        </Field>
      </div>
    </div>
  );
}

function toSlipcoverLabel(value: string) {
  return SLIPCOVER_STATUSES.find((status) => status.value === value)?.label || value;
}

function toObiLabel(value: string) {
  return OBI_STATUSES.find((status) => status.value === value)?.label || value;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground font-medium">{label}</label>
      {children}
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <label className="text-xs text-muted-foreground font-medium">{label}</label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
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
