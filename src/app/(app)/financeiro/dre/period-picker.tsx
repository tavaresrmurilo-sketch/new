"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { MONTHS_PT } from "@/lib/periods";

/** Seleção de mês, trimestre, semestre, ano ou intervalo personalizado. */
export function DrePeriodPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3));
  const [semester, setSemester] = useState(now.getMonth() < 6 ? 0 : 1);
  const [start, setStart] = useState(params.get("start") ?? "");
  const [end, setEnd] = useState(params.get("end") ?? "");
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  function apply() {
    let s = start;
    let e = end;
    if (mode === "month") {
      s = `${year}-${pad(month + 1)}-01`;
      e = `${year}-${pad(month + 1)}-${pad(lastDay(year, month))}`;
    } else if (mode === "quarter") {
      s = `${year}-${pad(quarter * 3 + 1)}-01`;
      e = `${year}-${pad(quarter * 3 + 3)}-${pad(lastDay(year, quarter * 3 + 2))}`;
    } else if (mode === "semester") {
      s = `${year}-${semester ? "07" : "01"}-01`;
      e = `${year}-${semester ? "12-31" : "06-30"}`;
    } else if (mode === "year") {
      s = `${year}-01-01`;
      e = `${year}-12-31`;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (e > today) e = today;
    if (!s || !e || s > e) return;
    router.push(`${pathname}?start=${s}&end=${e}`);
    setOpen(false);
  }

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Selecionar período
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Período do DRE</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Tipo">
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="month">Mês</option>
              <option value="quarter">Trimestre</option>
              <option value="semester">Semestre</option>
              <option value="year">Ano</option>
              <option value="custom">Intervalo personalizado</option>
            </Select>
          </Field>
          {mode !== "custom" ? (
            <Field label="Ano">
              <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {mode === "month" ? (
            <Field label="Mês">
              <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTHS_PT.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {mode === "quarter" ? (
            <Field label="Trimestre">
              <Select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
                {[0, 1, 2, 3].map((q) => (
                  <option key={q} value={q}>
                    {q + 1}º trimestre
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {mode === "semester" ? (
            <Field label="Semestre">
              <Select value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
                <option value={0}>1º semestre</option>
                <option value={1}>2º semestre</option>
              </Select>
            </Field>
          ) : null}
          {mode === "custom" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início">
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="Fim">
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={apply}>Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
