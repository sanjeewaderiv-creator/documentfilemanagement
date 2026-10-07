import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ChevronDown, FilePlus2, FolderSearch, Pencil, Search, Trash2 } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type FileRecord = Tables<"file_records">;

const recordSchema = z.object({
  officer_number: z.string().trim().min(1, "නිලධාරී අංකය ඇතුළත් කරන්න / அலுவலர் இலக்கத்தை உள்ளிடுக / Enter officer number").max(50),
  file_number: z.string().trim().min(1, "ගොනු අංකය ඇතුළත් කරන්න / கோப்பு இலக்கத்தை உள்ளிடுக / Enter file number").max(80),
  record_year: z.coerce.number().int().min(1900, "වලංගු වර්ෂයක් ඇතුළත් කරන්න / சரியான ஆண்டை உள்ளிடுக / Enter a valid year").max(2200),
  file_name: z.string().trim().min(1, "ගොනුවේ නම ඇතුළත් කරන්න / கோப்பின் பெயரை உள்ளிடுக / Enter file name").max(200),
  cabinet_number: z.string().trim().min(1, "කබඩ් අංකය තෝරන්න / அலமாரி இலக்கத்தைத் தெரிவுசெய்க / Select cabinet number").max(50),
  shelf_number: z.string().trim().min(1, "කබඩ් තට්ටු අංකය තෝරන්න / தட்டு இலக்கத்தைத் தெரிவுசெய்க / Select shelf number").max(50),
});

type RecordForm = z.infer<typeof recordSchema>;

const emptyForm: RecordForm = {
  officer_number: "",
  file_number: "",
  record_year: new Date().getFullYear(),
  file_name: "",
  cabinet_number: "",
  shelf_number: "",
};

const CABINET_OPTIONS = Array.from({ length: 8 }, (_, i) => `කබඩ් / அலமாரி / Cabinet ${String(i + 1).padStart(2, "0")}`);
const SHELF_OPTIONS = Array.from({ length: 4 }, (_, i) => `තට්ටු / தட்டு / Shelf ${String(i + 1).padStart(2, "0")}`);

const recordsQuery = queryOptions({
  queryKey: ["file-records"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("file_records")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(recordsQuery),
  head: () => ({
    meta: [
      { title: "ලේඛනගත ගොනු විස්තර" },
      { name: "description", content: "ගොනු වාර්තා එක් කිරීම, සෙවීම සහ කළමනාකරණය කිරීමේ පද්ධතිය" },
      { property: "og:title", content: "ලේඛනගත ගොනු විස්තර" },
      { property: "og:description", content: "ගොනු වාර්තා එක් කිරීම, සෙවීම සහ කළමනාකරණය කිරීමේ පද්ධතිය" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FileRecordsPage,
});

function FileRecordsPage() {
  const queryClient = useQueryClient();
  const { data: records = [], isError } = useQuery(recordsQuery);
  const [officerFilter, setOfficerFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("");
  const [fileNumberFilter, setFileNumberFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FileRecord | null>(null);
  const [form, setForm] = useState<RecordForm>(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [expandedOfficers, setExpandedOfficers] = useState<Set<string>>(new Set());

  function toggleOfficer(officer: string) {
    setExpandedOfficers((current) => {
      const next = new Set(current);
      if (next.has(officer)) next.delete(officer);
      else next.add(officer);
      return next;
    });
  }

  const officerOptions = useMemo(
    () => Array.from(new Set(records.map((record) => record.officer_number))).sort(),
    [records],
  );

  const hasFilters =
    officerFilter !== "all" || yearFilter.trim() !== "" || fileNumberFilter.trim() !== "" || subjectFilter.trim() !== "";

  const filteredRecords = useMemo(() => {
    const year = yearFilter.trim();
    const fileNumber = fileNumberFilter.trim().toLocaleLowerCase("si");
    const subject = subjectFilter.trim().toLocaleLowerCase("si");
    return records.filter((record) => {
      if (officerFilter !== "all" && record.officer_number !== officerFilter) return false;
      if (year && !String(record.record_year).includes(year)) return false;
      if (fileNumber && !record.file_number.toLocaleLowerCase("si").includes(fileNumber)) return false;
      if (subject && !record.file_name.toLocaleLowerCase("si").includes(subject)) return false;
      return true;
    });
  }, [records, officerFilter, yearFilter, fileNumberFilter, subjectFilter]);

  const groupedByOfficer = useMemo(() => {
    const groups = new Map<string, FileRecord[]>();
    for (const record of filteredRecords) {
      const list = groups.get(record.officer_number) ?? [];
      list.push(record);
      groups.set(record.officer_number, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, "si"));
  }, [filteredRecords]);

  function openNewRecord() {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setDialogOpen(true);
  }

  function openEdit(record: FileRecord) {
    setEditing(record);
    setForm({
      officer_number: record.officer_number,
      file_number: record.file_number,
      record_year: record.record_year,
      file_name: record.file_name,
      cabinet_number: record.cabinet_number,
      shelf_number: record.shelf_number,
    });
    setFormError("");
    setDialogOpen(true);
  }

  function updateField<K extends keyof RecordForm>(field: K, value: RecordForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const parsed = recordSchema.safeParse(form);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "සියලු තොරතුරු නිවැරදිව ඇතුළත් කරන්න / அனைத்து விவரங்களையும் சரியாக உள்ளிடுக / Enter all details correctly");
      return;
    }

    setIsSaving(true);
    const result = editing
      ? await supabase.from("file_records").update(parsed.data).eq("id", editing.id)
      : await supabase.from("file_records").insert(parsed.data);
    setIsSaving(false);

    if (result.error) {
      setFormError("වාර්තාව සුරැකීමට නොහැකි විය / பதிவைச் சேமிக்க முடியவில்லை / Could not save the record");
      return;
    }

    await queryClient.invalidateQueries({ queryKey: recordsQuery.queryKey });
    setDialogOpen(false);
    setNotice(editing ? "වාර්තාව යාවත්කාලීන කරන ලදී / பதிவு புதுப்பிக்கப்பட்டது / Record updated" : "නව වාර්තාව සුරකින ලදී / புதிய பதிவு சேமிக்கப்பட்டது / New record saved");
  }

  async function deleteRecord(record: FileRecord) {
    if (!window.confirm(`“${record.file_name}” — මකා දමන්නද? / நீக்கவா? / Delete this record?`)) return;
    const { error } = await supabase.from("file_records").delete().eq("id", record.id);
    if (error) {
      setNotice("මකා දැමීමට නොහැකි විය / நீக்க முடியவில்லை / Could not delete");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: recordsQuery.queryKey });
    setNotice("වාර්තාව මකා දමන ලදී / பதிவு நீக்கப்பட்டது / Record deleted");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <section className="mb-8 border-b border-border pb-8">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold">වාර්තා සොයන්න / பதிவுகளைத் தேடுக / Search Records</h2>
            <Button type="button" size="lg" onClick={openNewRecord} className="h-11 shrink-0">
              <FilePlus2 aria-hidden="true" />
              නව ගොනු වාර්තාව / புதிய பதிவு / New Record
            </Button>
          </div>
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="filter-officer">නිලධාරී / அலுவலர் / Officer</Label>
              <Select value={officerFilter} onValueChange={setOfficerFilter}>
                <SelectTrigger id="filter-officer" className="h-11 min-w-0 w-full">
                  <SelectValue placeholder="සියලු නිලධාරීන් / அனைத்து அலுவலர்கள் / All officers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">සියලු නිලධාරීන් / அனைத்து அலுவலர்கள் / All officers</SelectItem>
                  {officerOptions.map((officer) => (
                    <SelectItem key={officer} value={officer}>{officer}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="filter-year">වර්ෂය / ஆண்டு / Year</Label>
              <Input
                id="filter-year"
                value={yearFilter}
                onChange={(event) => setYearFilter(event.target.value)}
                placeholder="2026"
                inputMode="numeric"
                className="h-11"
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="filter-file-number">ගොනු අංකය / கோப்பு இலக்கம் / File No.</Label>
              <Input
                id="filter-file-number"
                value={fileNumberFilter}
                onChange={(event) => setFileNumberFilter(event.target.value)}
                placeholder="ACC/2026/01"
                className="h-11"
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="filter-subject">විෂය / விடயம் / Subject</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="filter-subject"
                  value={subjectFilter}
                  onChange={(event) => setSubjectFilter(event.target.value)}
                  placeholder="සොයන්න / தேடுக / Search..."
                  className="h-11 pl-10"
                />
              </div>
            </div>
          </div>
        </section>

        {notice && (
          <div role="status" className="mb-5 border-l-4 border-success bg-success-soft px-4 py-3 text-sm text-success-foreground">
            {notice}
          </div>
        )}

        <section aria-labelledby="records-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 id="records-heading" className="text-lg font-bold">ගොනු වාර්තා / கோப்பு பதிவுகள் / File Records</h2>
              <p className="mt-1 text-sm text-muted-foreground">වාර්තා / பதிவுகள் / Records: {filteredRecords.length}</p>
            </div>
          </div>

          <div className="grid gap-4">
            {groupedByOfficer.map(([officer, officerRecords]) => {
              const isOpen = expandedOfficers.has(officer);
              return (
                <div key={officer} className="overflow-hidden rounded-md border border-border bg-surface shadow-sm">
                  <button
                    type="button"
                    onClick={() => toggleOfficer(officer)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/60"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Archive aria-hidden="true" className="size-4" />
                      </div>
                      <div>
                        <p className="font-semibold">නිලධාරී අංකය / அலுவலர் இலக்கம் / Officer No.: {officer}</p>
                        <p className="text-sm text-muted-foreground">ගොනු වාර්තා / பதிவுகள் / Records: {officerRecords.length}</p>
                      </div>
                    </div>
                    <ChevronDown
                      aria-hidden="true"
                      className={`size-5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="overflow-x-auto border-t border-border">
                      <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                        <thead className="bg-primary text-primary-foreground">
                          <tr>
                            <th className="px-4 py-3 font-semibold">ගොනු අංකය<br/><span className="text-xs font-normal">கோப்பு இலக்கம் / File No.</span></th>
                            <th className="px-4 py-3 font-semibold">වර්ෂය<br/><span className="text-xs font-normal">ஆண்டு / Year</span></th>
                            <th className="px-4 py-3 font-semibold">ගොනුවේ නම<br/><span className="text-xs font-normal">கோப்பின் பெயர் / File Name</span></th>
                            <th className="px-4 py-3 font-semibold">කබඩ් අංකය<br/><span className="text-xs font-normal">அலமாரி இலக்கம் / Cabinet No.</span></th>
                            <th className="px-4 py-3 font-semibold">කබඩ් තට්ටු අංකය<br/><span className="text-xs font-normal">தட்டு இலக்கம் / Shelf No.</span></th>
                            <th className="w-20 px-4 py-3 text-center font-semibold">ක්‍රියා<br/><span className="text-xs font-normal">செயல்கள் / Actions</span></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {officerRecords.map((record) => (
                            <tr key={record.id} className="transition-colors hover:bg-muted/60">
                              <td className="px-4 py-4 font-medium">{record.file_number}</td>
                              <td className="px-4 py-4">{record.record_year}</td>
                              <td className="px-4 py-4">{record.file_name}</td>
                              <td className="px-4 py-4">{record.cabinet_number}</td>
                              <td className="px-4 py-4">{record.shelf_number}</td>
                              <td className="px-4 py-4 text-center">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" aria-label={`${record.file_name} ක්‍රියා`}>
                                      <ChevronDown aria-hidden="true" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => openEdit(record)}>
                                      <Pencil aria-hidden="true" /> වෙනස් කරන්න / திருத்துக / Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => deleteRecord(record)}>
                                      <Trash2 aria-hidden="true" /> මකා දමන්න / நீக்குக / Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            {!isError && groupedByOfficer.length === 0 && (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-md border border-border bg-surface px-6 text-center shadow-sm">
                <FolderSearch className="mb-4 size-9 text-muted-foreground" aria-hidden="true" />
                <p className="font-semibold">{hasFilters ? "ගැළපෙන වාර්තාවක් නොමැත / பொருத்தமான பதிவு இல்லை / No matching records" : "තවම ගොනු වාර්තා නොමැත / இதுவரை பதிவுகள் இல்லை / No records yet"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hasFilters ? "වෙනත් අංකයක් හෝ නමක් සොයන්න / வேறு இலக்கம் அல்லது பெயரைத் தேடுக / Try another number or name" : "ඉහළ බොත්තම භාවිතා කරන්න / மேலுள்ள பொத்தானைப் பயன்படுத்துக / Use the button above to add one"}
                </p>
              </div>
            )}
            {isError && <p className="rounded-md border border-border bg-surface p-6 text-sm text-destructive">වාර්තා ලබාගැනීමට නොහැකි විය / பதிவுகளைப் பெற முடியவில்லை / Could not load records</p>}
          </div>
        </section>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "වාර්තාව වෙනස් කරන්න / பதிவைத் திருத்துக / Edit Record" : "නව ගොනු වාර්තාව / புதிய கோப்பு பதிவு / New File Record"}</DialogTitle>
            <DialogDescription>සම්පූර්ණ විස්තර ඇතුළත් කරන්න / முழு விவரங்களையும் உள்ளிடுக / Enter all details</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveRecord} className="grid gap-5 pt-2">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField id="officer-number" label="නිලධාරී අංකය / அலுவலர் இலக்கம் / Officer No." value={form.officer_number} onChange={(value) => updateField("officer_number", value)} />
              <FormField id="file-number" label="ගොනු අංකය / கோப்பு இலக்கம் / File No." value={form.file_number} onChange={(value) => updateField("file_number", value)} />
              <FormField id="record-year" label="වර්ෂය / ஆண்டு / Year" type="number" value={String(form.record_year)} onChange={(value) => updateField("record_year", Number(value))} />
              <FormField id="file-name" label="ගොනුවේ නම / கோப்பின் பெயர் / File Name" value={form.file_name} onChange={(value) => updateField("file_name", value)} />
              <div className="grid gap-2">
                <Label htmlFor="cabinet-number">කබඩ් අංකය / அலமாரி இலக்கம் / Cabinet No.</Label>
                <Select value={form.cabinet_number} onValueChange={(value) => updateField("cabinet_number", value)}>
                  <SelectTrigger id="cabinet-number" className="w-full">
                    <SelectValue placeholder="තෝරන්න / தெரிவுசெய்க / Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {CABINET_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shelf-number">කබඩ් තට්ටු අංකය / தட்டு இலக்கம் / Shelf No.</Label>
                <Select value={form.shelf_number} onValueChange={(value) => updateField("shelf_number", value)}>
                  <SelectTrigger id="shelf-number" className="w-full">
                    <SelectValue placeholder="තෝරන්න / தெரிவுசெய்க / Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {SHELF_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formError && <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>}
            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>අවලංගු / ரத்து / Cancel</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? "සුරකිමින් / சேமிக்கிறது / Saving..." : "සුරකින්න / சேமி / Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function FormField({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} maxLength={type === "text" ? 200 : undefined} required />
    </div>
  );
}
