import { useEffect, useMemo, useState } from "react";
import { ChatOpenAI } from "@langchain/openai";
import mascotLogo from "../yaoxiaotuan.png";
import {
  Bell,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CirclePlus,
  ClipboardList,
  Clock3,
  Home,
  MapPin,
  Pill,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  UserRound
} from "lucide-react";

type Tab = "home" | "plans" | "ai" | "profile";

type MedicationPlan = {
  id: string;
  name: string;
  dose: string;
  frequency: string;
  timing: string;
  days: number;
  stock: number;
  reminder: string;
  revisit: string;
};

type ApiConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
  remember: boolean;
};

type AiForm = {
  disease: string;
  prescription: string;
  habit: string;
  revisitDate: string;
};

const storageKeys = {
  plans: "yaoxiaotuan_plans",
  api: "yaoxiaotuan_api_config"
};

const defaultPlans: MedicationPlan[] = [
  {
    id: "metformin",
    name: "二甲双胍片",
    dose: "0.5g",
    frequency: "每日 2 次",
    timing: "早晚餐后",
    days: 30,
    stock: 18,
    reminder: "08:10",
    revisit: "2026-05-20"
  },
  {
    id: "amlodipine",
    name: "苯磺酸氨氯地平片",
    dose: "5mg",
    frequency: "每日 1 次",
    timing: "早餐后",
    days: 28,
    stock: 7,
    reminder: "08:30",
    revisit: "2026-05-08"
  }
];

const emptyPlan: Omit<MedicationPlan, "id"> = {
  name: "",
  dose: "",
  frequency: "每日 1 次",
  timing: "早餐后",
  days: 30,
  stock: 14,
  reminder: "08:30",
  revisit: "2026-05-20"
};

const defaultConfig: ApiConfig = {
  apiKey: "",
  baseURL: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  remember: false
};

const defaultAiForm: AiForm = {
  disease: "2 型糖尿病合并高血压",
  prescription:
    "二甲双胍片 0.5g 每日2次 餐后；苯磺酸氨氯地平片 5mg 每日1次 早餐后",
  habit: "上班日早 8 点出门，午餐时间不固定，晚上 22 点后容易忘记服药。",
  revisitDate: "2026-05-20"
};

function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [plans, setPlans] = useState<MedicationPlan[]>(() => loadPlans());
  const [draft, setDraft] = useState(emptyPlan);
  const [config, setConfig] = useState<ApiConfig>(() => loadConfig());
  const [aiForm, setAiForm] = useState(defaultAiForm);
  const [aiResult, setAiResult] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [toast, setToast] = useState("今日 2 项用药提醒已准备好");

  useEffect(() => {
    localStorage.setItem(storageKeys.plans, JSON.stringify(plans));
  }, [plans]);

  useEffect(() => {
    if (config.remember) {
      localStorage.setItem(storageKeys.api, JSON.stringify(config));
    } else {
      localStorage.removeItem(storageKeys.api);
    }
  }, [config]);

  const stats = useMemo(() => {
    const lowStock = plans.filter((plan) => plan.stock <= 7).length;
    const nextPlan = plans
      .filter((plan) => plan.revisit)
      .sort((a, b) => a.revisit.localeCompare(b.revisit))[0];

    return {
      total: plans.length,
      lowStock,
      nextPlan,
      todayCount: Math.min(plans.length, 3)
    };
  }, [plans]);

  const savePlan = () => {
    if (!draft.name.trim() || !draft.dose.trim()) {
      setToast("请补全药品名称和单次剂量，避免提醒出错");
      return;
    }

    const plan: MedicationPlan = {
      ...draft,
      id: crypto.randomUUID()
    };
    setPlans((current) => [plan, ...current]);
    setDraft(emptyPlan);
    setToast(`${plan.name} 已加入用药计划`);
    setTab("plans");
  };

  const removePlan = (id: string) => {
    const removed = plans.find((plan) => plan.id === id);
    setPlans((current) => current.filter((plan) => plan.id !== id));
    setToast(`${removed?.name ?? "该药品"} 已从计划移除，可重新添加`);
  };

  const clearLocalData = () => {
    setPlans(defaultPlans);
    setAiResult("");
    localStorage.removeItem(storageKeys.plans);
    setToast("本地用药数据已重置为演示状态");
  };

  const generateAdvice = async () => {
    if (!config.apiKey.trim() || !config.baseURL.trim() || !config.model.trim()) {
      setToast("请先在「我的」页填写 API Key、网关地址和模型名");
      setTab("profile");
      return;
    }

    setIsGenerating(true);
    setAiResult("");

    try {
      const model = new ChatOpenAI({
        apiKey: config.apiKey,
        model: config.model,
        temperature: 0.2,
        configuration: {
          baseURL: config.baseURL
        }
      });

      const response = await model.invoke([
        {
          role: "system",
          content:
            "你是慢病用药提醒助手。只做信息整理、提醒规划和复诊准备建议，不做诊断，不更改处方。输出中文，结构清晰，适合移动端阅读。"
        },
        {
          role: "user",
          content: `请基于以下信息生成慢病用药管理建议：
慢病情况：${aiForm.disease}
处方信息：${aiForm.prescription}
生活习惯：${aiForm.habit}
下次复诊日期：${aiForm.revisitDate}

请包含：
1. 今日服药计划
2. 库存与续方提醒
3. 复诊前准备清单
4. 风险提醒
5. 一句免责声明`
        }
      ]);

      setAiResult(String(response.content));
      setToast("AI 管家已生成用药提醒建议");
    } catch (error) {
      setAiResult("");
      setToast(
        error instanceof Error
          ? `生成失败：${error.message}`
          : "生成失败，请检查网关、模型名或 API Key"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="app-shell">
      <section className="phone-frame" aria-label="药小团移动端应用">
        <Header toast={toast} />

        <div className="content">
          {tab === "home" && (
            <HomePage
              stats={stats}
              plans={plans}
              onStartPlan={() => setTab("plans")}
              onStartAi={() => setTab("ai")}
            />
          )}
          {tab === "plans" && (
            <PlanPage
              draft={draft}
              plans={plans}
              onDraftChange={setDraft}
              onSave={savePlan}
              onRemove={removePlan}
            />
          )}
          {tab === "ai" && (
            <AiPage
              form={aiForm}
              configReady={Boolean(config.apiKey && config.baseURL && config.model)}
              result={aiResult}
              isGenerating={isGenerating}
              onFormChange={setAiForm}
              onGenerate={generateAdvice}
              onOpenConfig={() => setTab("profile")}
            />
          )}
          {tab === "profile" && (
            <ProfilePage
              config={config}
              onConfigChange={setConfig}
              onClear={clearLocalData}
            />
          )}
        </div>

        <BottomNav tab={tab} onChange={setTab} />
      </section>
    </main>
  );
}

function Header({ toast }: { toast: string }) {
  return (
    <header className="hero">
      <div className="status-line">
        <span>21:15</span>
        <span className="signal">5G 87%</span>
      </div>
      <div className="top-bar">
        <div>
          <p className="eyebrow">慢病用药小管家</p>
          <h1>药小团</h1>
        </div>
        <div className="location-pill">
          <MapPin size={15} />
          浙江大学
        </div>
      </div>
      <div className="search-row" aria-label="搜索药品和计划">
        <Search size={19} />
        <span>搜索药品、处方、复诊事项</span>
        <button type="button">搜索</button>
      </div>
      <div className="toast" role="status">
        <CheckCircle2 size={16} />
        {toast}
      </div>
    </header>
  );
}

function HomePage({
  stats,
  plans,
  onStartPlan,
  onStartAi
}: {
  stats: {
    total: number;
    lowStock: number;
    todayCount: number;
    nextPlan?: MedicationPlan;
  };
  plans: MedicationPlan[];
  onStartPlan: () => void;
  onStartAi: () => void;
}) {
  return (
    <>
      {/* <section className="quick-grid">
        <ActionTile icon={<Pill />} label="用药计划" text="3 步建提醒" onClick={onStartPlan} />
        <ActionTile icon={<Bot />} label="AI 管家" text="整理处方" onClick={onStartAi} />
        <ActionTile icon={<CalendarClock />} label="复诊提醒" text="提前备清单" onClick={onStartPlan} />
        <ActionTile icon={<ShoppingBag />} label="续方购药" text="库存预警" onClick={onStartPlan} />
      </section> */}

      <section className="banner">
        <div>
          <p>24h 慢病陪伴</p>
          <h2>你只管忙，用药我来帮</h2>
          <span>今日 {stats.todayCount} 项提醒 · {stats.lowStock} 项库存偏低</span>
        </div>
        <img className="mascot" src={mascotLogo} alt="药小团 logo" />
      </section>

      <section className="card">
        <CardTitle icon={<Clock3 />} title="今日服药" action="全部计划" onClick={onStartPlan} />
        <div className="timeline">
          {plans.slice(0, 3).map((plan) => (
            <div className="timeline-item" key={plan.id}>
              <span className="time">{plan.reminder}</span>
              <div>
                <strong>{plan.name}</strong>
                <p>{plan.dose} · {plan.frequency} · {plan.timing}</p>
              </div>
              <span className="state">待提醒</span>
            </div>
          ))}
        </div>
      </section>

      <section className="split-row">
        <div className="mini-card">
          <span>下次复诊</span>
          <strong>{stats.nextPlan?.revisit ?? "未设置"}</strong>
          <p>{stats.nextPlan ? `${stats.nextPlan.name} 需带记录` : "添加计划后自动提醒"}</p>
        </div>
        <div className="mini-card alert">
          <span>库存预警</span>
          <strong>{stats.lowStock} 项</strong>
          <p>少于 7 天建议准备续方</p>
        </div>
      </section>

      <section className="doctor-strip">
        <div className="doctor-avatar">医</div>
        <div>
          <strong>秒问医生</strong>
          <p>复诊前把血压、血糖、漏服记录整理好</p>
        </div>
        <button type="button" onClick={onStartAi}>去整理</button>
      </section>
    </>
  );
}

function PlanPage({
  draft,
  plans,
  onDraftChange,
  onSave,
  onRemove
}: {
  draft: Omit<MedicationPlan, "id">;
  plans: MedicationPlan[];
  onDraftChange: (draft: Omit<MedicationPlan, "id">) => void;
  onSave: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      <section className="card">
        <CardTitle icon={<CirclePlus />} title="新增用药计划" action="保存" onClick={onSave} />
        <div className="form-grid">
          <Field label="药品名称" value={draft.name} placeholder="如：二甲双胍片" onChange={(name) => onDraftChange({ ...draft, name })} />
          <Field label="单次剂量" value={draft.dose} placeholder="如：0.5g / 5mg" onChange={(dose) => onDraftChange({ ...draft, dose })} />
          <Field label="服药频次" value={draft.frequency} placeholder="如：每日 2 次" onChange={(frequency) => onDraftChange({ ...draft, frequency })} />
          <Field label="服药时机" value={draft.timing} placeholder="如：早晚餐后" onChange={(timing) => onDraftChange({ ...draft, timing })} />
          <Field label="计划天数" type="number" value={String(draft.days)} onChange={(days) => onDraftChange({ ...draft, days: Number(days) || 1 })} />
          <Field label="剩余库存" type="number" value={String(draft.stock)} onChange={(stock) => onDraftChange({ ...draft, stock: Number(stock) || 0 })} />
          <Field label="提醒时间" type="time" value={draft.reminder} onChange={(reminder) => onDraftChange({ ...draft, reminder })} />
          <Field label="复诊日期" type="date" value={draft.revisit} onChange={(revisit) => onDraftChange({ ...draft, revisit })} />
        </div>
      </section>

      <section className="card">
        <CardTitle icon={<ClipboardList />} title="我的计划" action={`${plans.length} 项`} />
        <div className="plan-list">
          {plans.map((plan) => (
            <article className="plan-card" key={plan.id}>
              <div>
                <strong>{plan.name}</strong>
                <p>{plan.dose} · {plan.frequency} · {plan.timing}</p>
                <span>{plan.reminder} 提醒 · {plan.revisit} 复诊</span>
              </div>
              <div className="plan-side">
                <span className={plan.stock <= 7 ? "stock low" : "stock"}>{plan.stock} 天</span>
                <button type="button" aria-label={`删除 ${plan.name}`} onClick={() => onRemove(plan.id)}>
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function AiPage({
  form,
  configReady,
  result,
  isGenerating,
  onFormChange,
  onGenerate,
  onOpenConfig
}: {
  form: AiForm;
  configReady: boolean;
  result: string;
  isGenerating: boolean;
  onFormChange: (form: AiForm) => void;
  onGenerate: () => void;
  onOpenConfig: () => void;
}) {
  return (
    <>
      <section className="card ai-card">
        <CardTitle icon={<Bot />} title="AI 用药整理" action={configReady ? "已配置" : "去配置"} onClick={configReady ? undefined : onOpenConfig} />
        <p className="helper">
          录入处方和生活习惯，药小团会整理提醒节奏、库存续方和复诊清单。
        </p>
        <div className="form-grid single">
          <Field label="慢病情况" value={form.disease} onChange={(disease) => onFormChange({ ...form, disease })} />
          <label className="field textarea-field">
            <span>处方信息</span>
            <textarea value={form.prescription} onChange={(event) => onFormChange({ ...form, prescription: event.target.value })} />
          </label>
          <label className="field textarea-field">
            <span>生活习惯</span>
            <textarea value={form.habit} onChange={(event) => onFormChange({ ...form, habit: event.target.value })} />
          </label>
          <Field label="下次复诊日期" type="date" value={form.revisitDate} onChange={(revisitDate) => onFormChange({ ...form, revisitDate })} />
        </div>
        <button className="primary-button" type="button" onClick={onGenerate} disabled={isGenerating}>
          {isGenerating ? "正在生成..." : "生成用药计划"}
        </button>
      </section>

      <section className="card result-card">
        <CardTitle icon={<ShieldCheck />} title="管家建议" action="仅供提醒" />
        {result ? (
          <pre>{result}</pre>
        ) : (
          <div className="empty-state">
            <Bot size={30} />
            <p>生成后会在这里显示今日服药、续方库存、复诊准备和风险提醒。</p>
          </div>
        )}
        <p className="disclaimer">
          免责声明：药小团仅用于用药提醒和信息整理，不替代医生诊断、处方调整或线下急救。
        </p>
      </section>
    </>
  );
}

function ProfilePage({
  config,
  onConfigChange,
  onClear
}: {
  config: ApiConfig;
  onConfigChange: (config: ApiConfig) => void;
  onClear: () => void;
}) {
  return (
    <>
      <section className="card">
        <CardTitle icon={<Settings />} title="AI 网关配置" action={config.remember ? "已记住" : "会话内"} />
        <div className="form-grid single">
          <Field
            label="API Key"
            type="password"
            value={config.apiKey}
            placeholder="输入你的模型服务密钥"
            onChange={(apiKey) => onConfigChange({ ...config, apiKey })}
          />
          <Field
            label="Base URL / 网关"
            value={config.baseURL}
            placeholder="https://api.openai.com/v1"
            onChange={(baseURL) => onConfigChange({ ...config, baseURL })}
          />
          <Field
            label="模型名"
            value={config.model}
            placeholder="gpt-4o-mini"
            onChange={(model) => onConfigChange({ ...config, model })}
          />
          <label className="switch-row">
            <span>
              <strong>记住配置</strong>
              <small>开启后保存到当前浏览器 localStorage</small>
            </span>
            <input
              type="checkbox"
              checked={config.remember}
              onChange={(event) => onConfigChange({ ...config, remember: event.target.checked })}
            />
          </label>
        </div>
      </section>

      <section className="card privacy-card">
        <CardTitle icon={<ShieldCheck />} title="隐私与边界" />
        <ul>
          <li>API Key 由用户在前端输入，项目代码不包含密钥。</li>
          <li>处方内容仅用于本次生成，是否持久化由用户决定。</li>
          <li>AI 输出只做提醒整理，不建议自行增减药量。</li>
        </ul>
        <button className="danger-button" type="button" onClick={onClear}>
          清理本地演示数据
        </button>
      </section>
    </>
  );
}

function ActionTile({
  icon,
  label,
  text,
  onClick
}: {
  icon: JSX.Element;
  label: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button className="action-tile" type="button" onClick={onClick}>
      <span>{icon}</span>
      <strong>{label}</strong>
      <small>{text}</small>
    </button>
  );
}

function CardTitle({
  icon,
  title,
  action,
  onClick
}: {
  icon: JSX.Element;
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="card-title">
      <div>
        <span>{icon}</span>
        <h2>{title}</h2>
      </div>
      {action && (
        <button type="button" onClick={onClick}>
          {action}
          {onClick && <ChevronRight size={15} />}
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function BottomNav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const items = [
    { key: "home" as const, label: "首页", icon: Home },
    { key: "plans" as const, label: "计划", icon: Pill },
    { key: "ai" as const, label: "AI管家", icon: Bot },
    { key: "profile" as const, label: "我的", icon: UserRound }
  ];

  return (
    <nav className="bottom-nav" aria-label="底部导航">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            type="button"
            key={item.key}
            className={tab === item.key ? "active" : ""}
            onClick={() => onChange(item.key)}
          >
            <Icon size={21} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function loadPlans() {
  const saved = localStorage.getItem(storageKeys.plans);
  if (!saved) {
    return defaultPlans;
  }

  try {
    return JSON.parse(saved) as MedicationPlan[];
  } catch {
    return defaultPlans;
  }
}

function loadConfig() {
  const saved = localStorage.getItem(storageKeys.api);
  if (!saved) {
    return defaultConfig;
  }

  try {
    return { ...defaultConfig, ...JSON.parse(saved), remember: true } as ApiConfig;
  } catch {
    return defaultConfig;
  }
}

export default App;
