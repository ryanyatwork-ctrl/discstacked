import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Copy,
} from "lucide-react";
import {
  formatPreflightReport,
  preflightHeadline,
  type PreflightReport,
  type PreflightSeverity,
} from "@/lib/import-preflight";
import { toast } from "@/hooks/use-toast";

interface Props {
  report: PreflightReport;
  fileName: string;
  onBack: () => void;
  onContinue: () => void;
}

const SEVERITY_STYLES: Record<
  PreflightSeverity,
  { icon: typeof Info; chip: string; text: string; label: string }
> = {
  blocker: {
    icon: XCircle,
    chip: "bg-destructive/15 text-destructive border-destructive/30",
    text: "text-destructive",
    label: "Blocked",
  },
  warning: {
    icon: AlertTriangle,
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    text: "text-amber-600 dark:text-amber-400",
    label: "Needs a look",
  },
  info: {
    icon: Info,
    chip: "bg-secondary text-muted-foreground border-border",
    text: "text-muted-foreground",
    label: "For information",
  },
};

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "good" | "warn" | "bad" | "plain";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "text-destructive"
          : "text-foreground";

  return (
    <div className="rounded-md border border-border/60 bg-secondary/20 px-3 py-2">
      <div className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

export function ImportPreflightReport({ report, fileName, onBack, onContinue }: Props) {
  const [onlyProblems, setOnlyProblems] = useState(true);

  const verdictTone: PreflightSeverity =
    report.willFail > 0 ? "blocker" : report.withWarnings > 0 ? "warning" : "info";
  const VerdictIcon =
    report.willFail > 0 ? XCircle : report.withWarnings > 0 ? AlertTriangle : CheckCircle2;

  const visibleRows = useMemo(() => {
    const rows = onlyProblems
      ? report.rows.filter((r) => r.issues.some((i) => i.severity !== "info"))
      : report.rows.filter((r) => r.issues.length > 0);
    return rows.slice(0, 200);
  }, [report.rows, onlyProblems]);

  const problemRowCount = report.rows.filter((r) =>
    r.issues.some((i) => i.severity !== "info"),
  ).length;

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(formatPreflightReport(report, 500));
      toast({ title: "Report copied", description: "Paste it anywhere for troubleshooting." });
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Your browser blocked clipboard access.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4 py-2">
      {/* Verdict */}
      <div className="flex items-start gap-3 rounded-md border border-border/60 bg-secondary/20 p-3">
        <VerdictIcon
          className={`h-5 w-5 mt-0.5 shrink-0 ${
            report.willFail > 0
              ? "text-destructive"
              : report.withWarnings > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400"
          }`}
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">{preflightHeadline(report)}</p>
          <p className="text-xs text-muted-foreground truncate">
            {fileName} · detected as{" "}
            <span className="text-accent">{report.profile.label}</span>
            {report.autoDetected ? "" : " (chosen manually)"}
          </p>
        </div>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat value={report.totalRows} label="Rows" tone="plain" />
        <Stat value={report.clean} label="Clean" tone="good" />
        <Stat value={report.withWarnings} label="Warnings" tone="warn" />
        <Stat value={report.willFail} label="Blocked" tone="bad" />
      </div>

      {report.willFail > 0 && (
        <p className="text-xs text-destructive">
          {report.willFail} row{report.willFail === 1 ? "" : "s"} cannot be imported and will be
          skipped. Everything else still imports.
        </p>
      )}

      {/* Findings digest */}
      {report.byCode.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">What was found</p>
          <div className="flex flex-wrap gap-1.5">
            {report.byCode.map((c) => (
              <Badge
                key={c.code}
                variant="outline"
                className={`text-[11px] font-normal ${SEVERITY_STYLES[c.severity].chip}`}
              >
                {c.code.replace(/_/g, " ").toLowerCase()} · {c.count}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Column notes */}
      {(report.emptyColumns.length > 0 || report.unmappedColumns.length > 0) && (
        <div className="space-y-1 text-[11px] text-muted-foreground">
          {report.emptyColumns.length > 0 && (
            <p>
              <span className="text-foreground">Empty columns:</span>{" "}
              {report.emptyColumns.join(", ")}
            </p>
          )}
          {report.unmappedColumns.length > 0 && (
            <p>
              <span className="text-foreground">Ignored (not recognised):</span>{" "}
              {report.unmappedColumns.join(", ")}
            </p>
          )}
        </div>
      )}

      <Separator />

      {/* Row detail */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">
          {onlyProblems
            ? `Rows needing attention (${problemRowCount})`
            : `All rows with notes (${report.rows.filter((r) => r.issues.length > 0).length})`}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => setOnlyProblems((v) => !v)}
          >
            {onlyProblems ? "Include info notes" : "Problems only"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={copyReport}>
            <Copy className="h-3 w-3 mr-1" />
            Copy report
          </Button>
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          Nothing to flag — every row parsed cleanly.
        </p>
      ) : (
        <ScrollArea className="h-[280px] rounded-md border border-border/60">
          <div className="divide-y divide-border/50">
            {visibleRows.map((row) => (
              <div key={row.sheetRow} className="p-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                    Row {row.sheetRow}
                  </span>
                  <span className="text-xs text-foreground truncate">{row.title}</span>
                  {!row.willImport && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 ${SEVERITY_STYLES.blocker.chip}`}
                    >
                      skipped
                    </Badge>
                  )}
                </div>
                {row.issues
                  .filter((i) => (onlyProblems ? i.severity !== "info" : true))
                  .map((issue, idx) => {
                    const S = SEVERITY_STYLES[issue.severity];
                    const Icon = S.icon;
                    return (
                      <div key={idx} className="flex gap-1.5 pl-1">
                        <Icon className={`h-3 w-3 mt-0.5 shrink-0 ${S.text}`} />
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            {issue.message}
                          </p>
                          {issue.suggestion && (
                            <p className="text-[11px] text-accent/90 leading-snug">
                              → {issue.suggestion}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {visibleRows.length === 200 && (
        <p className="text-[11px] text-muted-foreground">
          Showing the first 200. Use “Copy report” for the full list.
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Choose another file
        </Button>
        <Button size="sm" onClick={onContinue} disabled={report.willImport === 0}>
          Continue to review
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        Nothing has been imported yet. The next step is the editable review list.
      </p>
    </div>
  );
}
