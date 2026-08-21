"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChefHat, History, Plus, Send, ShoppingBasket, Sparkles, X } from "lucide-react";

type Language = "pt-BR" | "en";
type Item = { id: string; name: string; quantity: number | null; unit: string; quantity_state: string | null; location: string; priority: string; expires_at: string | null };
type Shopping = { id: string; name: string; quantity: number | null; unit: string; checked: boolean };
type Action = { action: string; item: string; quantity?: number | null; unit?: string; priority?: string };
type InventoryForm = { name: string; quantity: string; unit: string; location: string; priority: string; expiresAt: string };
type CookForm = { people: string; minutes: string; style: string; restrictions: string };

const emptyInventoryForm: InventoryForm = { name: "", quantity: "", unit: "unit", location: "pantry", priority: "normal", expiresAt: "" };
const emptyCookForm: CookForm = { people: "2", minutes: "40", style: "", restrictions: "" };

const translations = {
  "pt-BR": {
    language: "Idioma",
    tagline: "Sua cozinha tem um inventário.",
    selfHosted: "auto-hospedado",
    heroEyebrow: "O que vamos cozinhar hoje?",
    heroTitle: "Conte ao Sous o que mudou na sua cozinha.",
    commandPlaceholder: "Comprei 2 kg de frango e seis tomates",
    preview: "Pré-visualizar",
    willUpdate: "O Sous vai atualizar:",
    confirm: "Confirmar",
    inventoryUpdated: "Inventário atualizado.",
    commandPartial: "Alguns itens não foram encontrados no inventário.",
    nothingToPreview: "Digite uma alteração para começar.",
    useFirst: "Use primeiro",
    nothingUrgent: "Nada urgente por enquanto.",
    markEmpty: "Marcar como vazio",
    inventory: "Inventário",
    add: "Adicionar",
    addItem: "Adicionar item",
    addFirstItem: "Cadastre o primeiro item",
    itemName: "Nome do item",
    quantity: "Quantidade",
    unit: "Unidade",
    location: "Local",
    priority: "Prioridade",
    expiration: "Validade",
    optional: "opcional",
    save: "Salvar",
    cancel: "Cancelar",
    itemAdded: "Item adicionado ao inventário.",
    emptyInventory: "O inventário está vazio. Adicione um item ou use o campo acima para registrar uma compra.",
    loading: "Carregando…",
    loadingError: "Não foi possível carregar o inventário. Verifique a conexão com o banco.",
    saveError: "Não foi possível salvar essa alteração.",
    commandError: "Não consegui entender esse comando.",
    shopping: "Lista de compras",
    addShoppingPlaceholder: "Adicionar item",
    persistentTitle: "Verdade persistente",
    persistentText: "Toda alteração confirmada vira um movimento no inventário. O Sous não trata memória de conversa como estoque.",
    cookTitle: "Sugestão de refeição",
    cookText: "Use o que já está no inventário para montar uma ideia simples.",
    people: "Pessoas",
    minutes: "Minutos",
    style: "Estilo",
    stylePlaceholder: "ex.: brasileiro, massa, leve",
    restrictions: "Restrições",
    restrictionsPlaceholder: "ex.: sem lactose",
    suggest: "Sugerir refeição",
    suggesting: "Pensando…",
    cookError: "Não foi possível gerar uma sugestão.",
    locations: { fridge: "Geladeira", freezer: "Freezer", pantry: "Despensa", drinks: "Bebidas", other: "Outro" },
    priorities: { normal: "Normal", use_soon: "Usar em breve", urgent: "Urgente" },
    quantityStates: { full: "cheio", enough: "suficiente", half: "metade", low: "pouco", almost_empty: "quase vazio", empty: "vazio" },
    units: { unit: "un.", g: "g", kg: "kg", ml: "ml", l: "l", package: "pacote", bottle: "garrafa", can: "lata", box: "caixa" },
    actions: { add: "adicionar", consume: "consumir", mark_empty: "esvaziar", priority: "priorizar" }
  },
  en: {
    language: "Language",
    tagline: "Your kitchen has an inventory.",
    selfHosted: "self-hosted",
    heroEyebrow: "What should we cook today?",
    heroTitle: "Tell Sous what changed in your kitchen.",
    commandPlaceholder: "Bought 2 kg of chicken and six tomatoes",
    preview: "Preview",
    willUpdate: "Sous will update:",
    confirm: "Confirm",
    inventoryUpdated: "Inventory updated.",
    commandPartial: "Some items were not found in the inventory.",
    nothingToPreview: "Type a change to get started.",
    useFirst: "Use first",
    nothingUrgent: "Nothing urgent right now.",
    markEmpty: "Mark empty",
    inventory: "Inventory",
    add: "Add",
    addItem: "Add item",
    addFirstItem: "Add the first item",
    itemName: "Item name",
    quantity: "Quantity",
    unit: "Unit",
    location: "Location",
    priority: "Priority",
    expiration: "Expiration",
    optional: "optional",
    save: "Save",
    cancel: "Cancel",
    itemAdded: "Item added to inventory.",
    emptyInventory: "The inventory is empty. Add an item or use the command box to record a purchase.",
    loading: "Loading…",
    loadingError: "Could not load inventory. Check the database connection.",
    saveError: "Could not save that change.",
    commandError: "I could not understand that command.",
    shopping: "Shopping list",
    addShoppingPlaceholder: "Add an item",
    persistentTitle: "Persistent truth",
    persistentText: "Every confirmed change is stored as an inventory movement. Sous never treats chat memory as stock.",
    cookTitle: "Meal suggestion",
    cookText: "Use what is already in inventory to build a simple idea.",
    people: "People",
    minutes: "Minutes",
    style: "Style",
    stylePlaceholder: "e.g. Brazilian, pasta, light",
    restrictions: "Restrictions",
    restrictionsPlaceholder: "e.g. dairy-free",
    suggest: "Suggest a meal",
    suggesting: "Thinking…",
    cookError: "Could not generate a suggestion.",
    locations: { fridge: "Fridge", freezer: "Freezer", pantry: "Pantry", drinks: "Drinks", other: "Other" },
    priorities: { normal: "Normal", use_soon: "Use soon", urgent: "Urgent" },
    quantityStates: { full: "full", enough: "enough", half: "half", low: "low", almost_empty: "almost empty", empty: "empty" },
    units: { unit: "unit", g: "g", kg: "kg", ml: "ml", l: "l", package: "package", bottle: "bottle", can: "can", box: "box" },
    actions: { add: "add", consume: "consume", mark_empty: "empty", priority: "prioritize" }
  }
} as const;

export default function Dashboard() {
  const [language, setLanguage] = useState<Language>("pt-BR");
  const [items, setItems] = useState<Item[]>([]);
  const [shopping, setShopping] = useState<Shopping[]>([]);
  const [command, setCommand] = useState("");
  const [preview, setPreview] = useState<Action[]>([]);
  const [message, setMessage] = useState("");
  const [shoppingName, setShoppingName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [inventoryForm, setInventoryForm] = useState<InventoryForm>(emptyInventoryForm);
  const [cookForm, setCookForm] = useState<CookForm>(emptyCookForm);
  const [suggestion, setSuggestion] = useState("");
  const [loading, setLoading] = useState(true);
  const [cooking, setCooking] = useState(false);

  const copy = translations[language];

  useEffect(() => {
    const stored = window.localStorage.getItem("sous-language");
    if (stored === "en" || stored === "pt-BR") setLanguage(stored);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("sous-language", language);
    document.documentElement.lang = language === "pt-BR" ? "pt-BR" : "en";
  }, [language]);

  async function load() {
    setLoading(true);
    try {
      const [inventoryResponse, shoppingResponse] = await Promise.all([fetch("/api/inventory"), fetch("/api/shopping")]);
      const inventoryData = await inventoryResponse.json();
      const shoppingData = await shoppingResponse.json();
      if (!inventoryResponse.ok || !shoppingResponse.ok) throw new Error(copy.loadingError);
      setItems(inventoryData.items ?? []);
      setShopping(shoppingData.items ?? []);
    } catch {
      setMessage(copy.loadingError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const urgent = useMemo(() => items.filter((item) => item.priority !== "normal" || item.quantity_state === "almost_empty"), [items]);
  const groups = useMemo(() => items.reduce<Record<string, Item[]>>((acc, item) => {
    (acc[item.location] ??= []).push(item);
    return acc;
  }, {}), [items]);

  const locationLabel = (location: string) => copy.locations[location as keyof typeof copy.locations] ?? location;
  const priorityLabel = (priority: string) => copy.priorities[priority as keyof typeof copy.priorities] ?? priority;
  const quantityLabel = (state: string | null) => state ? copy.quantityStates[state as keyof typeof copy.quantityStates] ?? state : "—";
  const unitLabel = (unit: string) => copy.units[unit as keyof typeof copy.units] ?? unit;
  const actionLabel = (action: string) => copy.actions[action as keyof typeof copy.actions] ?? action;

  function itemQuantity(item: Item) {
    return item.quantity === null ? quantityLabel(item.quantity_state) : String(item.quantity) + " " + unitLabel(item.unit);
  }

  async function previewCommand(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!command.trim()) { setMessage(copy.nothingToPreview); return; }
    try {
      const response = await fetch("/api/commands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: command }) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error ?? copy.commandError); return; }
      setPreview(data.actions ?? []);
    } catch {
      setMessage(copy.commandError);
    }
  }

  async function confirmCommand() {
    try {
      const response = await fetch("/api/commands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: command, confirm: true }) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error ?? copy.saveError); return; }
      const failed = Array.isArray(data.results) && data.results.some((result: { error?: string }) => result.error);
      setMessage(failed ? copy.commandPartial : copy.inventoryUpdated);
      setCommand("");
      setPreview([]);
      await load();
    } catch {
      setMessage(copy.saveError);
    }
  }

  async function saveInventory(event: React.FormEvent) {
    event.preventDefault();
    if (!inventoryForm.name.trim()) return;
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: inventoryForm.name,
          quantity: inventoryForm.quantity === "" ? null : Number(inventoryForm.quantity),
          unit: inventoryForm.unit,
          location: inventoryForm.location,
          priority: inventoryForm.priority,
          expiresAt: inventoryForm.expiresAt === "" ? null : inventoryForm.expiresAt
        })
      });
      const data = await response.json();
      if (!response.ok) { setMessage(typeof data.error === "string" ? data.error : copy.saveError); return; }
      setInventoryForm(emptyInventoryForm);
      setShowAdd(false);
      setMessage(copy.itemAdded);
      await load();
    } catch {
      setMessage(copy.saveError);
    }
  }

  async function addShopping(event: React.FormEvent) {
    event.preventDefault();
    if (!shoppingName.trim()) return;
    try {
      const response = await fetch("/api/shopping", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: shoppingName }) });
      if (!response.ok) throw new Error(copy.saveError);
      setShoppingName("");
      await load();
    } catch {
      setMessage(copy.saveError);
    }
  }

  async function markEmpty(id: string) {
    const response = await fetch("/api/inventory/" + id + "/empty", { method: "POST" });
    if (!response.ok) { setMessage(copy.saveError); return; }
    await load();
  }

  async function toggleShopping(item: Shopping) {
    const response = await fetch("/api/shopping/" + item.id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ checked: !item.checked }) });
    if (!response.ok) { setMessage(copy.saveError); return; }
    await load();
  }

  async function suggestMeal(event: React.FormEvent) {
    event.preventDefault();
    setCooking(true);
    setSuggestion("");
    try {
      const response = await fetch("/api/cook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          people: Number(cookForm.people) || 2,
          minutes: Number(cookForm.minutes) || 40,
          style: cookForm.style,
          restrictions: cookForm.restrictions
        })
      });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error ?? copy.cookError); return; }
      setSuggestion(data.suggestion ?? "");
    } catch {
      setMessage(copy.cookError);
    } finally {
      setCooking(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 md:px-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3"><div className="rounded-2xl bg-moss p-3 text-cream"><ChefHat size={24} /></div><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-moss">Sous</p><p className="text-sm text-slate-600">{copy.tagline}</p></div></div>
        <div className="flex items-center gap-3"><label className="text-xs font-semibold text-slate-500" htmlFor="language">{copy.language}</label><select id="language" value={language} onChange={(event) => setLanguage(event.target.value as Language)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="pt-BR">Português (Brasil)</option><option value="en">English</option></select><span className="rounded-full bg-sage px-3 py-1 text-xs font-semibold text-moss">{copy.selfHosted}</span></div>
      </header>

      <section className="mb-8 rounded-3xl bg-moss p-6 text-cream shadow-sm md:p-8">
        <p className="mb-2 text-sm uppercase tracking-[0.18em] text-sage">{copy.heroEyebrow}</p>
        <h1 className="mb-5 max-w-xl text-3xl font-semibold tracking-tight md:text-4xl">{copy.heroTitle}</h1>
        <form onSubmit={previewCommand} className="flex flex-col gap-3 md:flex-row">
          <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder={copy.commandPlaceholder} className="min-h-12 flex-1 rounded-2xl border-0 bg-white px-4 text-ink outline-none ring-sage placeholder:text-slate-400 focus:ring-2" />
          <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-terracotta px-5 font-semibold text-white transition hover:opacity-90"><Send size={17} /> {copy.preview}</button>
        </form>
        {preview.length > 0 && <div className="mt-4 rounded-2xl bg-white/10 p-4"><p className="mb-2 text-sm font-semibold">{copy.willUpdate}</p><ul className="space-y-1 text-sm">{preview.map((action, index) => <li key={index}>• {actionLabel(action.action)} {action.quantity ? action.quantity + " " : ""}{action.item}</li>)}</ul><button type="button" onClick={confirmCommand} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-moss"><Check size={16} /> {copy.confirm}</button></div>}
        {message && <p className="mt-3 text-sm text-sage">{message}</p>}
      </section>

      <section className="mb-8">
        <div className="mb-4 flex items-center gap-2"><AlertTriangle className="text-terracotta" size={19} /><h2 className="text-lg font-semibold">{copy.useFirst}</h2></div>
        {urgent.length ? <div className="grid gap-3 md:grid-cols-3">{urgent.map((item) => <div key={item.id} className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.name}</p><p className="mt-1 text-sm text-slate-500">{itemQuantity(item)}</p></div><span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-terracotta">{priorityLabel(item.priority)}</span></div><button type="button" onClick={() => markEmpty(item.id)} className="mt-4 text-xs font-semibold text-slate-500 hover:text-terracotta">{copy.markEmpty}</button></div>)}</div> : <p className="rounded-2xl bg-white p-5 text-sm text-slate-500">{copy.nothingUrgent}</p>}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{copy.inventory}</h2><button type="button" onClick={() => setShowAdd((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold shadow-sm">{showAdd ? <X size={16} /> : <Plus size={16} />} {showAdd ? copy.cancel : copy.add}</button></div>
          {showAdd && <form onSubmit={saveInventory} className="mb-4 grid gap-3 rounded-3xl bg-white p-5 shadow-sm md:grid-cols-2"><label className="md:col-span-2"><span className="mb-1 block text-xs font-semibold text-slate-500">{copy.itemName}</span><input required value={inventoryForm.name} onChange={(event) => setInventoryForm({ ...inventoryForm, name: event.target.value })} className="w-full rounded-xl bg-cream px-3 py-2 text-sm outline-none ring-moss focus:ring-2" /></label><label><span className="mb-1 block text-xs font-semibold text-slate-500">{copy.quantity} <em className="font-normal">({copy.optional})</em></span><input type="number" min="0" step="0.001" value={inventoryForm.quantity} onChange={(event) => setInventoryForm({ ...inventoryForm, quantity: event.target.value })} className="w-full rounded-xl bg-cream px-3 py-2 text-sm outline-none ring-moss focus:ring-2" /></label><label><span className="mb-1 block text-xs font-semibold text-slate-500">{copy.unit}</span><select value={inventoryForm.unit} onChange={(event) => setInventoryForm({ ...inventoryForm, unit: event.target.value })} className="w-full rounded-xl bg-cream px-3 py-2 text-sm"><option value="unit">{copy.units.unit}</option><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">l</option><option value="package">{copy.units.package}</option><option value="bottle">{copy.units.bottle}</option><option value="can">{copy.units.can}</option><option value="box">{copy.units.box}</option></select></label><label><span className="mb-1 block text-xs font-semibold text-slate-500">{copy.location}</span><select value={inventoryForm.location} onChange={(event) => setInventoryForm({ ...inventoryForm, location: event.target.value })} className="w-full rounded-xl bg-cream px-3 py-2 text-sm"><option value="fridge">{copy.locations.fridge}</option><option value="freezer">{copy.locations.freezer}</option><option value="pantry">{copy.locations.pantry}</option><option value="drinks">{copy.locations.drinks}</option><option value="other">{copy.locations.other}</option></select></label><label><span className="mb-1 block text-xs font-semibold text-slate-500">{copy.priority}</span><select value={inventoryForm.priority} onChange={(event) => setInventoryForm({ ...inventoryForm, priority: event.target.value })} className="w-full rounded-xl bg-cream px-3 py-2 text-sm"><option value="normal">{copy.priorities.normal}</option><option value="use_soon">{copy.priorities.use_soon}</option><option value="urgent">{copy.priorities.urgent}</option></select></label><label><span className="mb-1 block text-xs font-semibold text-slate-500">{copy.expiration} <em className="font-normal">({copy.optional})</em></span><input type="date" value={inventoryForm.expiresAt} onChange={(event) => setInventoryForm({ ...inventoryForm, expiresAt: event.target.value })} className="w-full rounded-xl bg-cream px-3 py-2 text-sm" /></label><div className="flex items-end md:col-span-2"><button className="rounded-xl bg-moss px-4 py-2 text-sm font-semibold text-cream">{copy.save}</button></div></form>}
          {loading ? <p className="rounded-2xl bg-white p-5 text-sm text-slate-500">{copy.loading}</p> : items.length === 0 ? <div className="rounded-3xl bg-white p-6 text-sm text-slate-500 shadow-sm"><p>{copy.emptyInventory}</p><button type="button" onClick={() => setShowAdd(true)} className="mt-4 rounded-xl bg-moss px-4 py-2 font-semibold text-cream">{copy.addFirstItem}</button></div> : <div className="grid gap-4 md:grid-cols-2">{Object.entries(groups).map(([location, locationItems]) => <div key={location} className="rounded-3xl bg-white p-5 shadow-sm"><h3 className="mb-4 font-semibold text-moss">{locationLabel(location)}</h3><ul className="space-y-3">{locationItems.map((item) => <li key={item.id} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0"><div><p className="font-medium">{item.name}</p><p className="text-sm text-slate-500">{itemQuantity(item)}</p></div>{item.expires_at && <span className="text-xs text-slate-400">{item.expires_at}</span>}</li>)}</ul></div>)}</div>}
        </section>

        <aside className="space-y-6">
          <section className="rounded-3xl bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><ShoppingBasket size={18} className="text-moss" /><h2 className="font-semibold">{copy.shopping}</h2></div><form onSubmit={addShopping} className="mb-4 flex gap-2"><input value={shoppingName} onChange={(event) => setShoppingName(event.target.value)} placeholder={copy.addShoppingPlaceholder} className="min-w-0 flex-1 rounded-xl bg-cream px-3 py-2 text-sm outline-none ring-moss focus:ring-2" /><button aria-label={copy.add} className="rounded-xl bg-moss px-3 text-cream"><Plus size={16} /></button></form><ul className="space-y-3">{shopping.map((item) => <li key={item.id} className="flex items-center gap-2 text-sm"><button type="button" onClick={() => toggleShopping(item)} className={"flex h-5 w-5 items-center justify-center rounded-md border " + (item.checked ? "border-moss bg-moss text-white" : "border-slate-300")}>{item.checked && <Check size={13} />}</button><span className={item.checked ? "text-slate-400 line-through" : ""}>{item.name}</span></li>)}</ul></section>

          <section className="rounded-3xl bg-white p-5 shadow-sm"><div className="mb-2 flex items-center gap-2"><Sparkles size={18} className="text-terracotta" /><h2 className="font-semibold">{copy.cookTitle}</h2></div><p className="mb-4 text-sm leading-6 text-slate-500">{copy.cookText}</p><form onSubmit={suggestMeal} className="grid grid-cols-2 gap-2"><label><span className="mb-1 block text-xs font-semibold text-slate-500">{copy.people}</span><input type="number" min="1" max="20" value={cookForm.people} onChange={(event) => setCookForm({ ...cookForm, people: event.target.value })} className="w-full rounded-xl bg-cream px-3 py-2 text-sm" /></label><label><span className="mb-1 block text-xs font-semibold text-slate-500">{copy.minutes}</span><input type="number" min="5" max="240" value={cookForm.minutes} onChange={(event) => setCookForm({ ...cookForm, minutes: event.target.value })} className="w-full rounded-xl bg-cream px-3 py-2 text-sm" /></label><label className="col-span-2"><span className="mb-1 block text-xs font-semibold text-slate-500">{copy.style}</span><input value={cookForm.style} onChange={(event) => setCookForm({ ...cookForm, style: event.target.value })} placeholder={copy.stylePlaceholder} className="w-full rounded-xl bg-cream px-3 py-2 text-sm" /></label><label className="col-span-2"><span className="mb-1 block text-xs font-semibold text-slate-500">{copy.restrictions}</span><input value={cookForm.restrictions} onChange={(event) => setCookForm({ ...cookForm, restrictions: event.target.value })} placeholder={copy.restrictionsPlaceholder} className="w-full rounded-xl bg-cream px-3 py-2 text-sm" /></label><button className="col-span-2 rounded-xl bg-terracotta px-4 py-2 text-sm font-semibold text-white">{cooking ? copy.suggesting : copy.suggest}</button></form>{suggestion && <div className="mt-4 rounded-2xl bg-sage p-4 text-sm leading-6 text-moss">{suggestion}</div>}</section>

          <section className="rounded-3xl bg-sage p-5 text-moss"><div className="mb-2 flex items-center gap-2"><History size={18} /><h2 className="font-semibold">{copy.persistentTitle}</h2></div><p className="text-sm leading-6">{copy.persistentText}</p></section>
        </aside>
      </div>
    </main>
  );
}
