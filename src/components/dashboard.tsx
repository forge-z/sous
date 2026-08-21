"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChefHat, History, Plus, Send, ShoppingBasket } from "lucide-react";

type Item = { id: string; name: string; quantity: number | null; unit: string; quantity_state: string | null; location: string; priority: string; expires_at: string | null };
type Shopping = { id: string; name: string; quantity: number | null; unit: string; checked: boolean };
type Action = { action: string; item: string; quantity?: number | null; unit?: string; priority?: string };

const locationLabels: Record<string, string> = { fridge: "Fridge", freezer: "Freezer", pantry: "Pantry", drinks: "Drinks", other: "Other" };

export default function Dashboard() {
  const [items, setItems] = useState<Item[]>([]);
  const [shopping, setShopping] = useState<Shopping[]>([]);
  const [command, setCommand] = useState("");
  const [preview, setPreview] = useState<Action[]>([]);
  const [message, setMessage] = useState("");
  const [shoppingName, setShoppingName] = useState("");

  async function load() {
    const [inventoryResponse, shoppingResponse] = await Promise.all([fetch("/api/inventory"), fetch("/api/shopping")]);
    setItems((await inventoryResponse.json()).items ?? []);
    setShopping((await shoppingResponse.json()).items ?? []);
  }

  useEffect(() => { void load(); }, []);

  const urgent = useMemo(() => items.filter((item) => item.priority !== "normal" || item.quantity_state === "almost_empty"), [items]);
  const groups = useMemo(() => items.reduce<Record<string, Item[]>>((acc, item) => {
    (acc[item.location] ??= []).push(item);
    return acc;
  }, {}), [items]);

  async function previewCommand(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/commands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: command }) });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error ?? "Could not understand that"); return; }
    setPreview(data.actions);
  }

  async function confirmCommand() {
    const response = await fetch("/api/commands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: command, confirm: true }) });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error ?? "Could not apply command"); return; }
    setMessage("Inventory updated.");
    setCommand("");
    setPreview([]);
    await load();
  }

  async function addShopping(event: React.FormEvent) {
    event.preventDefault();
    if (!shoppingName.trim()) return;
    await fetch("/api/shopping", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: shoppingName }) });
    setShoppingName("");
    await load();
  }

  async function markEmpty(id: string) {
    await fetch("/api/inventory/" + id + "/empty", { method: "POST" });
    await load();
  }

  async function toggleShopping(item: Shopping) {
    await fetch("/api/shopping/" + item.id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ checked: !item.checked }) });
    await load();
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 md:px-10">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3"><div className="rounded-2xl bg-moss p-3 text-cream"><ChefHat size={24} /></div><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-moss">Sous</p><p className="text-sm text-slate-600">Your kitchen has an inventory.</p></div></div>
        <span className="rounded-full bg-sage px-3 py-1 text-xs font-semibold text-moss">self-hosted</span>
      </header>

      <section className="mb-8 rounded-3xl bg-moss p-6 text-cream shadow-sm md:p-8">
        <p className="mb-2 text-sm uppercase tracking-[0.18em] text-sage">What should we cook today?</p>
        <h1 className="mb-5 max-w-xl text-3xl font-semibold tracking-tight md:text-4xl">Tell Sous what changed in your kitchen.</h1>
        <form onSubmit={previewCommand} className="flex flex-col gap-3 md:flex-row">
          <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Bought 2 kg of chicken and six tomatoes" className="min-h-12 flex-1 rounded-2xl border-0 bg-white px-4 text-ink outline-none ring-sage placeholder:text-slate-400 focus:ring-2" />
          <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-terracotta px-5 font-semibold text-white transition hover:opacity-90"><Send size={17} /> Preview</button>
        </form>
        {preview.length > 0 && <div className="mt-4 rounded-2xl bg-white/10 p-4"><p className="mb-2 text-sm font-semibold">Sous will update:</p><ul className="space-y-1 text-sm">{preview.map((action, index) => <li key={index}>• {action.action} {action.quantity ? action.quantity + " " : ""}{action.item}</li>)}</ul><button onClick={confirmCommand} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-moss"><Check size={16} /> Confirm</button></div>}
        {message && <p className="mt-3 text-sm text-sage">{message}</p>}
      </section>

      <section className="mb-8">
        <div className="mb-4 flex items-center gap-2"><AlertTriangle className="text-terracotta" size={19} /><h2 className="text-lg font-semibold">Use first</h2></div>
        {urgent.length ? <div className="grid gap-3 md:grid-cols-3">{urgent.map((item) => <div key={item.id} className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.name}</p><p className="mt-1 text-sm text-slate-500">{item.quantity ?? item.quantity_state ?? "unknown"} {item.unit}</p></div><span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-terracotta">{item.priority.replace("_", " ")}</span></div><button onClick={() => markEmpty(item.id)} className="mt-4 text-xs font-semibold text-slate-500 hover:text-terracotta">Mark empty</button></div>)}</div> : <p className="rounded-2xl bg-white p-5 text-sm text-slate-500">Nothing urgent right now.</p>}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Inventory</h2><button className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold shadow-sm"><Plus size={16} /> Add</button></div>
          <div className="grid gap-4 md:grid-cols-2">{Object.entries(groups).map(([location, locationItems]) => <div key={location} className="rounded-3xl bg-white p-5 shadow-sm"><h3 className="mb-4 font-semibold text-moss">{locationLabels[location] ?? location}</h3><ul className="space-y-3">{locationItems.map((item) => <li key={item.id} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0"><div><p className="font-medium">{item.name}</p><p className="text-sm text-slate-500">{item.quantity ?? item.quantity_state ?? "—"} {item.unit}</p></div>{item.expires_at && <span className="text-xs text-slate-400">expires {item.expires_at}</span>}</li>)}</ul></div>)}</div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-3xl bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><ShoppingBasket size={18} className="text-moss" /><h2 className="font-semibold">Shopping list</h2></div><form onSubmit={addShopping} className="mb-4 flex gap-2"><input value={shoppingName} onChange={(event) => setShoppingName(event.target.value)} placeholder="Add an item" className="min-w-0 flex-1 rounded-xl bg-cream px-3 py-2 text-sm outline-none ring-moss focus:ring-2" /><button className="rounded-xl bg-moss px-3 text-cream"><Plus size={16} /></button></form><ul className="space-y-3">{shopping.map((item) => <li key={item.id} className="flex items-center gap-2 text-sm"><button onClick={() => toggleShopping(item)} className={"flex h-5 w-5 items-center justify-center rounded-md border " + (item.checked ? "border-moss bg-moss text-white" : "border-slate-300")}>{item.checked && <Check size={13} />}</button><span className={item.checked ? "text-slate-400 line-through" : ""}>{item.name}</span></li>)}</ul></section>
          <section className="rounded-3xl bg-sage p-5 text-moss"><div className="mb-2 flex items-center gap-2"><History size={18} /><h2 className="font-semibold">Persistent truth</h2></div><p className="text-sm leading-6">Every confirmed change is stored as an inventory movement. Sous never treats chat memory as stock.</p></section>
        </aside>
      </div>
    </main>
  );
}
