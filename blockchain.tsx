"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  Copy,
  Download,
  Home,
  Layers,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
  History as HistoryIcon,
  ImagePlus,
  WifiOff,
  Activity,
  LogOut,
} from "lucide-react";
import type { Content } from "@/lib/validation";
import {
  api,
  blank,
  compress,
  isStandalone,
  vapidBytes,
  type State,
  type RecordItem,
  type Template,
} from "@/lib/client";
type View =
  "Home" | "Create" | "History" | "Settings" | "Templates" | "Diagnostics";
const nav = [
  { name: "Home", Icon: Home },
  { name: "Create", Icon: Plus },
  { name: "Templates", Icon: Layers },
  { name: "History", Icon: HistoryIcon },
  { name: "Settings", Icon: Settings },
] as const;
const time = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
function day(date: string) {
  const d = new Date(date).toDateString();
  if (d === new Date().toDateString()) return "Today";
  if (d === new Date(Date.now() - 86400000).toDateString()) return "Yesterday";
  return "Older";
}
function diagnosticValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "OK" : "Needs attention";
  return Array.isArray(value)
    ? value.join(", ")
    : String(value ?? "Unavailable");
}
function Logo({
  assetId,
  preview,
  size = 44,
}: {
  assetId?: string | null;
  preview?: string | null;
  size?: number;
}) {
  return (
    <img
      className="logo"
      width={size}
      height={size}
      src={
        preview || (assetId ? `/api/assets/${assetId}` : "/icons/icon-192.png")
      }
      alt=""
    />
  );
}
function Preview({
  value,
  imagePreview,
}: {
  value: Content;
  imagePreview?: string | null;
}) {
  return (
    <div className="preview">
      <div className="preview-top">
        <Logo assetId={value.assetId} preview={imagePreview} size={27} />
        <span>
          Blockchain
          {value.profile && value.profile !== "Blockchain"
            ? ` · ${value.profile}`
            : ""}
        </span>
        <small>now</small>
      </div>
      <strong>{value.title || "Your next notification"}</strong>
      <p>
        {value.message || "A little reminder. A timely update. Make it yours."}
      </p>
      {value.secondary && <p className="muted">{value.secondary}</p>}
    </div>
  );
}
export default function Blockchain() {
  const sheetRef = useRef<HTMLElement>(null);
  const [state, setState] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [view, setView] = useState<View>("Home"),
    [step, setStep] = useState(0),
    [form, setForm] = useState<Content>({ ...blank }),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [imagePreview, setImagePreview] = useState<string | null>(null),
    [code, setCode] = useState(""),
    [deviceName, setDeviceName] = useState("My iPhone"),
    [installed, setInstalled] = useState(false),
    [permission, setPermission] = useState("Unknown"),
    [swActive, setSwActive] = useState(false),
    [browserConnected, setBrowserConnected] = useState(false),
    [online, setOnline] = useState(true),
    [templateEdit, setTemplateEdit] = useState<Template | null>(null),
    [detail, setDetail] = useState<RecordItem | null>(null),
    [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(
      null,
    ),
    [appearance, setAppearance] = useState("Dark"),
    [idempotency, setIdempotency] = useState("");
  const refresh = useCallback(async () => {
    const data = await api<State>("state");
    setState(data);
    setDeviceName(data.device.name);
    return data;
  }, []);
  const action = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    const sync = () => {
      setInstalled(isStandalone());
      setPermission(
        "Notification" in window ? Notification.permission : "unsupported",
      );
      setOnline(navigator.onLine);
      if ("serviceWorker" in navigator)
        void navigator.serviceWorker
          .getRegistration()
          .then(async (reg) => {
            if (reg && active)
              setBrowserConnected(
                Boolean(await reg.pushManager.getSubscription()),
              );
          })
          .catch(() => {});
    };
    const frame = requestAnimationFrame(() => {
      if (!active) return;
      sync();
      setIdempotency(crypto.randomUUID());
      setAppearance(localStorage.getItem("appearance") || "Dark");
    });
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then(async (registration) => {
          if (active) {
            setSwActive(true);
            setBrowserConnected(
              Boolean(await registration.pushManager.getSubscription()),
            );
          }
        })
        .catch(() => {
          if (active)
            setError("Service Worker could not start. Reload over HTTPS.");
        });
    void api<State>("state")
      .then(async (data) => {
        if (!active) return;
        setState(data);
        setDeviceName(data.device.name);
        setStep(4);
        const id = new URL(location.href).searchParams.get("notification");
        if (id) {
          setDetail(data.notifications.find((n) => n.id === id) || null);
          setView("History");
          history.replaceState(null, "", "/");
        }
      })
      .catch((e) => {
        if (active && (e as { status?: number }).status !== 401)
          setError(
            "Backend unavailable. Configure the database and try again.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const visibility = () => {
      if (document.visibilityState === "visible") {
        sync();
        void refresh().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refresh]);
  useEffect(() => {
    document.documentElement.dataset.appearance = appearance;
  }, [appearance]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);
  useEffect(() => {
    if (!detail) return;
    const previous = document.activeElement as HTMLElement | null;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetail(null);
      if (event.key !== "Tab") return;
      const targets = Array.from(
        sheetRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input,select,textarea",
        ) || [],
      );
      const first = targets[0],
        last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, [detail]);
  function create(value: Content = { ...blank }) {
    setForm({ ...value });
    setTemplateEdit(null);
    setIdempotency(crypto.randomUUID());
    setView("Create");
    setDetail(null);
  }
  async function enable() {
    // Must invoke permission before awaits to preserve the iOS user gesture.
    if (!isStandalone() && /iPhone|iPad|iPod/.test(navigator.userAgent))
      throw new Error(
        "Install Blockchain on your Home Screen, then open its icon.",
      );
    if (!("Notification" in window) || !("PushManager" in window))
      throw new Error(
        "Web Push is unavailable in this browser. Use an installed app on iOS 16.4 or later.",
      );
    if (!state?.vapidPublicKey)
      throw new Error("Configure VAPID on the server first.");
    if (!swActive)
      throw new Error(
        "Service Worker is not ready. Reload over HTTPS and try again.",
      );
    const granted = await Notification.requestPermission();
    setPermission(granted);
    if (granted !== "granted")
      throw new Error(
        "Notifications are not allowed. Review iPhone Settings → Notifications → Blockchain.",
      );
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!state.connected && subscription) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription =
      subscription ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidBytes(state.vapidPublicKey),
      }));
    await api("subscription", "POST", subscription.toJSON());
    setBrowserConnected(true);
    await refresh();
    setStep(3);
    setNotice("Your device is connected.");
  }
  async function send(test = false) {
    const c = test
      ? {
          ...blank,
          name: "Test notification",
          title: "You’re connected.",
          message: "Your first real Blockchain notification.",
        }
      : form;
    const result = await api<RecordItem>("notifications", "POST", {
      content: c,
      idempotencyKey: test ? crypto.randomUUID() : idempotency,
    });
    await refresh();
    if (result.status === "Failed") {
      setIdempotency(crypto.randomUUID());
      throw new Error(
        "Push failed. Review History and reconnect notifications.",
      );
    }
    setNotice(
      result.status === "Sent"
        ? "Notification sent. Accepted by push service."
        : "Acceptance is unconfirmed. Refresh History and check your device before sending again.",
    );
    setIdempotency(crypto.randomUUID());
    if (!test) setView("History");
  }
  async function upload(file: File) {
    const blob = await compress(file);
    setImagePreview(URL.createObjectURL(blob));
    try {
      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setForm((v) => ({ ...v, assetId: result.id }));
    } finally {
      setImagePreview(null);
    }
  }
  async function deleteRecord(n: RecordItem) {
    if (!confirm("Delete this record and its history?")) return;
    await api(`notifications/${n.id}`, "DELETE");
    setDetail(null);
    await refresh();
  }
  const connected =
    state?.connected && browserConnected && permission === "granted";
  const historyItems = state?.notifications || [];
  const last = state?.notifications.find((n) => n.status === "Sent");
  function notificationList(items: RecordItem[], grouped = false) {
    return items.length ? (
      <div className="records">
        {items.map((n, i) => (
          <div key={n.id}>
            {grouped &&
              (i === 0 || day(n.createdAt) !== day(items[i - 1].createdAt)) && (
                <h3 className="eyebrow group-heading">{day(n.createdAt)}</h3>
              )}
            <button className="record" onClick={() => setDetail(n)}>
              <Logo assetId={n.content.assetId} />
              <span className="record-text">
                <strong>{n.content.name}</strong>
                <span>{n.content.title}</span>
                <small>{n.content.message}</small>
              </span>
              <span className="record-meta">
                <span>{time(n.sentAt || n.createdAt)}</span>
                <small className={`status ${n.status.toLowerCase()}`}>
                  {n.status}
                </small>
                <ChevronRight size={15} />
              </span>
            </button>
          </div>
        ))}
      </div>
    ) : (
      <div className="empty">
        <Bell size={28} />
        <h3>A clean start.</h3>
        <p>Your notifications will appear here.</p>
        <button className="secondary" onClick={() => create()}>
          Create Notification <Plus size={16} />
        </button>
      </div>
    );
  }
  if (loading)
    return (
      <main className="launch">
        <Logo size={90} />
        <h1>Blockchain</h1>
        <span className="loader" />
      </main>
    );
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="wordmark">
          <Logo size={34} />
          <span>BLOCKCHAIN</span>
        </div>
        <button
          className="icon-button"
          aria-label="Open settings"
          onClick={() => setView("Settings")}
        >
          <SlidersHorizontal size={19} />
        </button>
      </header>
      {!online && (
        <div className="banner">
          <WifiOff size={16} /> Offline. Connect to send or manage
          notifications.
        </div>
      )}
      {(error || notice) && (
        <div
          role={error ? "alert" : "status"}
          className={`toast ${error ? "error" : ""}`}
        >
          <span>{error || notice}</span>
          <button
            aria-label="Dismiss"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {!state || step < 4 ? (
        <main className="onboarding">
          <div className="step-indicator">
            {[0, 1, 2, 3].map((n) => (
              <span key={n} className={step >= n ? "active" : ""} />
            ))}
          </div>
          {step === 0 && (
            <>
              <div className="onboard-symbol">
                <Logo size={112} />
              </div>
              <p className="eyebrow">A LITTLE MORE INTENTIONAL</p>
              <h1>
                Stay in the
                <br />
                know. On your terms.
              </h1>
              <p>
                Your personal notification center.
                <br />
                Made for the moments that matter.
              </p>
              <button className="primary" onClick={() => setStep(1)}>
                Continue <ArrowUpRight size={19} />
              </button>
            </>
          )}
          {step === 1 && (
            <>
              <div className="onboard-symbol">
                <Download size={45} />
              </div>
              <h1>
                Install
                <br />
                Blockchain.
              </h1>
              <p>
                {installed
                  ? "You’re already using the installed app."
                  : "A place on your Home Screen. Ready when you are."}
              </p>
              {!installed && (
                <ol className="instructions">
                  <li>Open this URL in Safari on your iPhone.</li>
                  <li>Tap Share, then Add to Home Screen.</li>
                  <li>Keep “Open as Web App” enabled if shown.</li>
                  <li>Open the Blockchain icon to continue.</li>
                </ol>
              )}
              <button className="primary" onClick={() => setStep(2)}>
                {installed ? "Continue" : "Continue setup"}
                <ChevronRight size={18} />
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <div className="onboard-symbol">
                <ShieldCheck size={45} />
              </div>
              <h1>
                {state ? "Make the connection." : "Your device.\nYour space."}
              </h1>
              <p>
                {state
                  ? "Allow Blockchain to deliver the notifications you create, even when the app is closed."
                  : "Enter the private pairing code from your deployment to connect this iPhone securely."}
              </p>
              {!state ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(async () => {
                      await api("pair", "POST", { code, name: deviceName });
                      setCode("");
                      await refresh();
                    });
                  }}
                >
                  <label>
                    DEVICE NAME
                    <input
                      required
                      maxLength={60}
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                    />
                  </label>
                  <label>
                    PAIRING CODE
                    <input
                      type="password"
                      autoComplete="off"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Connect device <ShieldCheck size={18} />
                  </button>
                </form>
              ) : (
                <>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void action(enable)}
                  >
                    Enable Notifications <Bell size={18} />
                  </button>
                  <button className="text-button" onClick={() => setStep(4)}>
                    Explore the app first
                  </button>
                </>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <div className="onboard-symbol">
                <Check size={48} />
              </div>
              <h1>Ready.</h1>
              <p>
                Your device is connected.
                <br />
                Let’s make your first notification.
              </p>
              <button className="primary" onClick={() => setStep(4)}>
                Open Blockchain <ArrowUpRight size={18} />
              </button>
            </>
          )}
        </main>
      ) : (
        <>
          <main className="content" key={view}>
            {view === "Home" && (
              <>
                <div className="greeting">
                  <p className="eyebrow">YOUR PERSONAL NOTIFICATION CENTER</p>
                  <h1>
                    On your
                    <br />
                    <span>terms.</span>
                  </h1>
                  <button
                    className={`connection ${connected ? "connected" : ""}`}
                    onClick={() => setView("Settings")}
                  >
                    <i />
                    {connected
                      ? "Notifications Active"
                      : "Connect notifications"}
                    <ChevronRight size={13} />
                  </button>
                </div>
                <button className="create-card" onClick={() => create()}>
                  <span className="card-plus">
                    <Plus size={26} />
                  </span>
                  <span className="eyebrow">SOMETHING WORTH KNOWING</span>
                  <strong>
                    Create
                    <br />
                    Notification
                  </strong>
                  <span className="card-footer">
                    A message. A moment. Your call.
                    <ArrowUpRight size={24} />
                  </span>
                  <div className="card-orbit" aria-hidden="true" />
                </button>
                <div className="quick-links">
                  <button onClick={() => create()}>
                    <Plus size={21} />
                    <strong>New</strong>
                    <span>Create</span>
                  </button>
                  <button onClick={() => setView("History")}>
                    <HistoryIcon size={21} />
                    <strong>
                      {historyItems.length.toString().padStart(2, "0")}
                    </strong>
                    <span>History</span>
                  </button>
                  <button onClick={() => setView("Templates")}>
                    <Layers size={21} />
                    <strong>
                      {state.templates.length.toString().padStart(2, "0")}
                    </strong>
                    <span>Templates</span>
                  </button>
                </div>
                <div className="section-heading">
                  <h2>Last Notification</h2>
                  <button onClick={() => setView("History")}>
                    View all <ArrowUpRight size={14} />
                  </button>
                </div>
                {last ? (
                  notificationList([last])
                ) : (
                  <div className="last-empty">
                    <span className="mini-bell">
                      <Bell size={19} />
                    </span>
                    <div>
                      <strong>Good things start here.</strong>
                      <p>Send your first notification to get started.</p>
                    </div>
                  </div>
                )}
                <div className="privacy-note">
                  <ShieldCheck size={13} /> Private by design. Controlled by
                  you.
                </div>
              </>
            )}
            {view === "Create" && (
              <>
                <p className="eyebrow">MAKE IT PERSONAL</p>
                <h1>
                  {templateEdit ? "Edit template" : "Create notification"}
                  <span className="orange">.</span>
                </h1>
                <div className="section-heading">
                  <span className="eyebrow">LIVE PREVIEW</span>
                  <span className="tiny">
                    Illustration · iOS controls native appearance
                  </span>
                </div>
                <Preview value={form} imagePreview={imagePreview} />
                <form
                  className="composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(async () => {
                      if (templateEdit) {
                        await api(
                          `templates/${templateEdit.id}`,
                          "PATCH",
                          form,
                        );
                        await refresh();
                        setView("Templates");
                        setNotice("Template updated.");
                      } else await send();
                    });
                  }}
                >
                  {state.templates.length > 0 && !templateEdit && (
                    <label>
                      USE TEMPLATE
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const t = state.templates.find(
                            (t) => t.id === e.target.value,
                          );
                          if (t) setForm({ ...t.content });
                        }}
                      >
                        <option value="">Start from a template</option>
                        {state.templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.content.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="form-section">
                    <label>
                      NOTIFICATION NAME
                      <input
                        required
                        maxLength={80}
                        placeholder="Bitcoin received"
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      APP / PROFILE NAME
                      <input
                        required
                        maxLength={40}
                        value={form.profile}
                        onChange={(e) =>
                          setForm({ ...form, profile: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      IMAGE / LOGO
                      <span className="image-upload">
                        <Logo
                          assetId={form.assetId}
                          preview={imagePreview}
                          size={46}
                        />
                        <span>
                          <strong>Choose an image</strong>
                          <small>
                            JPEG, PNG or WebP · automatically optimized
                          </small>
                        </span>
                        <ImagePlus size={21} />
                        <input
                          aria-label="Choose notification image"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={busy}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void action(() => upload(file));
                            e.target.value = "";
                          }}
                        />
                      </span>
                    </label>
                    {form.assetId && (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setForm({ ...form, assetId: null })}
                      >
                        Remove image
                      </button>
                    )}
                  </div>
                  <div className="form-section">
                    <label>
                      TITLE
                      <input
                        required
                        maxLength={100}
                        placeholder="Payment received"
                        value={form.title}
                        onChange={(e) =>
                          setForm({ ...form, title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      MESSAGE
                      <textarea
                        required
                        rows={3}
                        maxLength={600}
                        placeholder="You received 0.00521 BTC."
                        value={form.message}
                        onChange={(e) =>
                          setForm({ ...form, message: e.target.value })
                        }
                      />
                      <small className="count">{form.message.length}/600</small>
                    </label>
                    <label>
                      SECONDARY TEXT <span className="muted">OPTIONAL</span>
                      <input
                        maxLength={120}
                        placeholder="A little more context"
                        value={form.secondary}
                        onChange={(e) =>
                          setForm({ ...form, secondary: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      DESTINATION URL <span className="muted">OPTIONAL</span>
                      <input
                        type="url"
                        maxLength={500}
                        placeholder="https://your-allowed-domain.com"
                        value={form.destination}
                        onChange={(e) =>
                          setForm({ ...form, destination: e.target.value })
                        }
                      />
                    </label>
                    <p className="helper">
                      Native notifications always belong to Blockchain. A
                      destination opens from notification details after your
                      confirmation.
                    </p>
                  </div>
                  <button className="primary" disabled={busy || !online}>
                    {busy
                      ? "Working…"
                      : templateEdit
                        ? "Save template"
                        : "Send Now"}
                    <Send size={18} />
                  </button>
                  {!templateEdit && (
                    <button
                      type="button"
                      className="secondary full"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await api("templates", "POST", form);
                          await refresh();
                          setNotice("Template saved.");
                        })
                      }
                    >
                      <Layers size={17} />
                      Save as Template
                    </button>
                  )}
                </form>
              </>
            )}
            {view === "History" && (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">YOUR ACTIVITY</p>
                    <h1>
                      {view}
                      <span className="orange">.</span>
                    </h1>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Create notification"
                    onClick={() => create()}
                  >
                    <Plus />
                  </button>
                </div>
                <p className="page-description">
                  Every message, all in one place.
                </p>
                {notificationList(historyItems, true)}
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await refresh();
                      setNotice("Up to date.");
                    })
                  }
                >
                  Refresh activity
                </button>
                <p className="helper">
                  Sent means accepted by the push service, not confirmed display
                  on your iPhone. Pending or Unconfirmed means acceptance is
                  unknown; refresh before resending. There are no automatic
                  retries. Showing the latest 500 records.
                </p>
              </>
            )}
            {view === "Templates" && (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">YOUR SHORTCUTS</p>
                    <h1>
                      Templates<span className="orange">.</span>
                    </h1>
                  </div>
                  <button
                    aria-label="Create template"
                    className="icon-button"
                    onClick={() => create()}
                  >
                    <Plus />
                  </button>
                </div>
                <p className="page-description">
                  A good message deserves a second life.
                </p>
                {state.templates.map((t) => (
                  <article className="template-card" key={t.id}>
                    <div className="template-title">
                      <Logo assetId={t.content.assetId} />
                      <div>
                        <h3>{t.content.name}</h3>
                        <p>{t.content.title}</p>
                      </div>
                    </div>
                    <p>{t.content.message}</p>
                    <div className="actions">
                      <button
                        className="secondary"
                        onClick={() => create(t.content)}
                      >
                        Use <ArrowUpRight size={15} />
                      </button>
                      <button
                        aria-label={`Edit ${t.content.name}`}
                        className="icon-button"
                        onClick={() => {
                          setForm({ ...t.content });
                          setTemplateEdit(t);
                          setView("Create");
                        }}
                      >
                        <SlidersHorizontal size={17} />
                      </button>
                      <button
                        aria-label={`Duplicate ${t.content.name}`}
                        className="icon-button"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await api("templates", "POST", {
                              ...t.content,
                              name: `${t.content.name.slice(0, 73)} (copy)`,
                            });
                            await refresh();
                          })
                        }
                      >
                        <Copy size={17} />
                      </button>
                      <button
                        aria-label={`Delete ${t.content.name}`}
                        className="icon-button"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            if (confirm("Delete this template?")) {
                              await api(`templates/${t.id}`, "DELETE");
                              await refresh();
                            }
                          })
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </article>
                ))}
                {!state.templates.length && (
                  <div className="empty">
                    <Layers size={28} />
                    <h3>Start with something useful.</h3>
                    <p>Create your own, or customize a starting point.</p>
                    {[
                      [
                        "Bitcoin Received",
                        "Payment received",
                        "You received 0.00521 BTC.",
                      ],
                      [
                        "Price Alert",
                        "Your price reminder",
                        "Check the latest Bitcoin price.",
                      ],
                      [
                        "Personal Reminder",
                        "A moment for you",
                        "Time for a well-deserved break.",
                      ],
                    ].map(([name, title, message]) => (
                      <button
                        className="starter"
                        key={name}
                        onClick={() =>
                          create({ ...blank, name, title, message })
                        }
                      >
                        {name}
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {view === "Settings" && (
              <>
                <p className="eyebrow">MAKE YOURSELF AT HOME</p>
                <h1>
                  Settings<span className="orange">.</span>
                </h1>
                <h2 className="settings-label">Notifications</h2>
                <div className="settings-card">
                  <div className="setting-row">
                    <span>Permission</span>
                    <strong>
                      {permission === "granted"
                        ? "Allowed"
                        : permission === "denied"
                          ? "Denied"
                          : "Unknown"}
                    </strong>
                  </div>
                  <div className="setting-row">
                    <span>Push connection</span>
                    <strong className={connected ? "green" : ""}>
                      {connected ? "Connected" : "Disconnected"}
                    </strong>
                  </div>
                  <button
                    className="setting-row"
                    disabled={busy}
                    onClick={() => void action(enable)}
                  >
                    <span>
                      {connected
                        ? "Reconnect notifications"
                        : "Enable Notifications"}
                    </span>
                    <Bell size={17} />
                  </button>
                  <button
                    className="setting-row"
                    disabled={busy || !connected}
                    onClick={() => void action(() => send(true))}
                  >
                    <span>Send Test</span>
                    <Send size={17} />
                  </button>
                  <button
                    className="setting-row"
                    disabled={busy || !state.connected}
                    onClick={() =>
                      void action(async () => {
                        await api("subscription", "DELETE");
                        const reg =
                          "serviceWorker" in navigator
                            ? await navigator.serviceWorker.getRegistration()
                            : undefined;
                        await (
                          await reg?.pushManager.getSubscription()
                        )?.unsubscribe();
                        setBrowserConnected(false);
                        await refresh();
                        setNotice("Disconnected.");
                      })
                    }
                  >
                    <span>Disconnect push</span>
                    <X size={17} />
                  </button>
                </div>
                <h2 className="settings-label">Device</h2>
                <form
                  className="settings-card name-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(async () => {
                      await api("device", "PATCH", { name: deviceName });
                      await refresh();
                      setNotice("Device name saved.");
                    });
                  }}
                >
                  <label>
                    DEVICE NAME
                    <input
                      maxLength={60}
                      required
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                    />
                  </label>
                  <button className="secondary" disabled={busy}>
                    Save
                  </button>
                </form>
                <h2 className="settings-label">PWA</h2>
                <div className="settings-card">
                  <div className="setting-row">
                    <span>Installed</span>
                    <strong>{installed ? "Yes" : "No"}</strong>
                  </div>
                  <div className="setting-row">
                    <span>Service Worker</span>
                    <strong>{swActive ? "Active" : "Inactive"}</strong>
                  </div>
                  {!installed && (
                    <p className="helper padded">
                      Safari → Share → Add to Home Screen → Open Blockchain.
                    </p>
                  )}
                </div>
                <h2 className="settings-label">Storage & appearance</h2>
                <div className="settings-card">
                  <button
                    className="setting-row"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        for (const key of await caches.keys())
                          if (key.startsWith("blockchain-shell-"))
                            await caches.delete(key);
                        const cache = await caches.open("blockchain-shell-v2");
                        await cache.addAll([
                          "/offline.html",
                          "/icons/icon-192.png",
                        ]);
                        setNotice(
                          "Local cache refreshed. Server data preserved.",
                        );
                      })
                    }
                  >
                    <span>Clear local cache</span>
                    <Trash2 size={17} />
                  </button>
                  <button
                    className="setting-row"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await api("assets", "DELETE");
                        setNotice("Unused images removed.");
                      })
                    }
                  >
                    <span>Delete unused images</span>
                    <Trash2 size={17} />
                  </button>
                  <label className="setting-row">
                    <span>Appearance</span>
                    <select
                      value={appearance}
                      onChange={(e) => {
                        setAppearance(e.target.value);
                        localStorage.setItem("appearance", e.target.value);
                      }}
                    >
                      <option>Dark</option>
                      <option>System</option>
                    </select>
                  </label>
                </div>
                <h2 className="settings-label">About</h2>
                <div className="settings-card">
                  <div className="setting-row">
                    <span>Blockchain</span>
                    <strong>1.1.0 · Free edition</strong>
                  </div>
                  <button
                    className="setting-row"
                    onClick={() => setView("Diagnostics")}
                  >
                    <span>Advanced diagnostics</span>
                    <Activity size={17} />
                  </button>
                  <button
                    className="setting-row"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        if (
                          !confirm(
                            "Sign out and disconnect this device? You will need the pairing code to reconnect.",
                          )
                        )
                          return;
                        await api("session", "DELETE");
                        setState(null);
                        setStep(2);
                      })
                    }
                  >
                    <span>Sign out</span>
                    <LogOut size={17} />
                  </button>
                </div>
              </>
            )}
            {view === "Diagnostics" && (
              <>
                <p className="eyebrow">UNDER THE HOOD</p>
                <h1>
                  Diagnostics<span className="orange">.</span>
                </h1>
                <p className="page-description">
                  Real checks. No secrets exposed.
                </p>
                <div className="settings-card">
                  {Object.entries({
                    "PWA standalone": installed,
                    "Service Worker": swActive,
                    "Notification permission": permission === "granted",
                    "Push subscription": connected,
                    ...(diagnostics || {}),
                  }).map(([key, value]) => (
                    <div className="setting-row diagnostic" key={key}>
                      <span>{key}</span>
                      <strong className={value === true ? "green" : ""}>
                        {diagnosticValue(value)}
                      </strong>
                    </div>
                  ))}
                </div>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const result =
                        await api<Record<string, unknown>>("diagnostics");
                      const reg =
                        "serviceWorker" in navigator
                          ? await navigator.serviceWorker.getRegistration()
                          : undefined;
                      const subscription =
                        await reg?.pushManager.getSubscription();
                      setDiagnostics({
                        ...result,
                        "Browser subscription": Boolean(subscription),
                      });
                      await refresh();
                    })
                  }
                >
                  Run Diagnostics <Activity size={18} />
                </button>
              </>
            )}
          </main>
          <nav className="bottom-nav" aria-label="Main navigation">
            {nav.map(({ name, Icon }) => (
              <button
                key={name}
                className={view === name ? "active" : ""}
                onClick={() => (name === "Create" ? create() : setView(name))}
              >
                <span>
                  <Icon size={21} strokeWidth={view === name ? 2 : 1.65} />
                </span>
                <small>{name}</small>
              </button>
            ))}
          </nav>
        </>
      )}
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <section
            ref={sheetRef}
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Notification details"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="section-heading">
              <h2>{detail.content.name}</h2>
              <button
                autoFocus
                className="icon-button"
                aria-label="Close details"
                onClick={() => setDetail(null)}
              >
                <X size={19} />
              </button>
            </div>
            <Preview value={detail.content} />
            <div className="detail-meta">
              <span className={`status ${detail.status.toLowerCase()}`}>
                {detail.status}
              </span>
              <span>
                {new Date(detail.sentAt || detail.createdAt).toLocaleString()}
              </span>
            </div>
            {detail.content.destination && (
              <a
                className="secondary full"
                href={detail.content.destination}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open destination <ArrowUpRight size={16} />
              </a>
            )}
            <div className="detail-history">
              {detail.history?.map((h) => (
                <p key={h.id}>
                  <small>{new Date(h.createdAt).toLocaleString()}</small>
                  {h.detail}
                </p>
              ))}
            </div>
            <div className="sheet-actions">
              <button
                className="primary"
                onClick={() => create(detail.content)}
              >
                Send Again <Send size={17} />
              </button>
              <button
                className="secondary"
                onClick={() =>
                  create({
                    ...detail.content,
                    name: `${detail.content.name.slice(0, 73)} (copy)`,
                  })
                }
              >
                Duplicate <Copy size={17} />
              </button>
              <button
                className="danger text-button"
                disabled={busy}
                onClick={() => void action(() => deleteRecord(detail))}
              >
                Delete record <Trash2 size={16} />
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
