import { useEffect, useMemo, useState } from "react";
import { ChatOpenAI } from "@langchain/openai";
import mascotLogo from "../yaoxiaotuan.png";
import {
  Bot,
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
  Trash2,
  UserRound
} from "lucide-react";
import exampleFrontImage from "../example1.jpg";
import exampleInstructionImage from "../example2.jpg";
import exampleExpiryImage from "../example3.jpg";

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
  expiryDate: string;
  purchaseReminder: string;
};

type PlanDraft = Omit<MedicationPlan, "id">;

type ApiConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
  remember: boolean;
};

type DemoImage = {
  name: string;
  caption: string;
  src: string;
};

type AiImageState = {
  front: DemoImage;
  instruction: DemoImage;
  expiry: DemoImage;
};

type AiPlanJson = {
  plans: PlanDraft[];
  sourceSummary: string;
  riskNotice: string;
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
    revisit: "2026-05-20",
    expiryDate: "2026-12-07",
    purchaseReminder: "有效期不足 30 天时提醒购药"
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
    revisit: "2026-05-08",
    expiryDate: "2026-06-12",
    purchaseReminder: "预计 7 天内吃完，建议提前续方"
  }
];

const emptyPlan: PlanDraft = {
  name: "",
  dose: "",
  frequency: "每日 1 次",
  timing: "早餐后",
  days: 30,
  stock: 14,
  reminder: "08:30",
  revisit: "2026-05-20",
  expiryDate: "2026-12-31",
  purchaseReminder: "有效期不足 30 天时提醒购药"
};

const defaultConfig: ApiConfig = {
  apiKey: "",
  baseURL: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  remember: false
};

const demoImages: AiImageState = {
  front: {
    name: "example1.jpg",
    caption: "正面图（药品名称）",
    src: exampleFrontImage
  },
  instruction: {
    name: "example2.jpg",
    caption: "说明书图（用法用量）",
    src: exampleInstructionImage
  },
  expiry: {
    name: "example3.jpg",
    caption: "有效日期图（生产/失效）",
    src: exampleExpiryImage
  }
};

function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [plans, setPlans] = useState<MedicationPlan[]>(() => loadPlans());
  const [draft, setDraft] = useState<PlanDraft>(emptyPlan);
  const [config, setConfig] = useState<ApiConfig>(() => loadConfig());
  const [aiImages] = useState<AiImageState>(demoImages);
  const [aiSummary, setAiSummary] = useState<{ sourceSummary: string; riskNotice: string } | null>(null);
  const [aiPreviewPlans, setAiPreviewPlans] = useState<PlanDraft[]>([]);
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
    const nearExpiry = plans.filter((plan) => {
      const days = daysUntil(plan.expiryDate);
      return days >= 0 && days <= 30;
    }).length;
    const expired = plans.filter((plan) => daysUntil(plan.expiryDate) < 0).length;
    const nextPlan = plans
      .filter((plan) => plan.revisit)
      .sort((a, b) => a.revisit.localeCompare(b.revisit))[0];

    return {
      total: plans.length,
      lowStock,
      nearExpiry,
      expired,
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
      ...normalizeDraft(draft),
      id: crypto.randomUUID()
    };
    setPlans((current) => [plan, ...current]);
    setDraft(emptyPlan);
    setToast(`${plan.name} 已加入用药计划`);
    setTab("plans");
  };

  const confirmAiPlans = () => {
    if (!aiPreviewPlans.length) {
      setToast("请先生成 AI 识别结果");
      return;
    }

    const newPlans: MedicationPlan[] = aiPreviewPlans.map((plan) => ({
      ...normalizeDraft(plan),
      id: crypto.randomUUID()
    }));

    setPlans((current) => [...newPlans, ...current]);
    setToast(`已添加 ${newPlans.length} 条 AI 识别用药计划`);
    setAiPreviewPlans([]);
    setAiSummary(null);
    setTab("plans");
  };

  const removePlan = (id: string) => {
    const removed = plans.find((plan) => plan.id === id);
    setPlans((current) => current.filter((plan) => plan.id !== id));
    setToast(`${removed?.name ?? "该药品"} 已从计划移除，可重新添加`);
  };

  const clearLocalData = () => {
    setPlans(defaultPlans);
    setAiSummary(null);
    setAiPreviewPlans([]);
    localStorage.removeItem(storageKeys.plans);
    setToast("本地用药数据已重置为演示状态");
  };

  const updateAiPreviewPlan = (index: number, patch: Partial<PlanDraft>) => {
    setAiPreviewPlans((current) =>
      current.map((plan, i) => {
        if (i !== index) {
          return plan;
        }
        return normalizeDraft({ ...plan, ...patch });
      })
    );
  };

  const generateFromImages = async () => {
    if (!config.apiKey.trim() || !config.baseURL.trim() || !config.model.trim()) {
      setToast("请先在「我的」页填写 API Key、网关地址和模型名");
      setTab("profile");
      return;
    }

    setIsGenerating(true);
    setAiSummary(null);
    setAiPreviewPlans([]);

    try {
      const [frontDataUrl, instructionDataUrl, expiryDataUrl] = await Promise.all([
        assetUrlToDataUrl(aiImages.front.src),
        assetUrlToDataUrl(aiImages.instruction.src),
        assetUrlToDataUrl(aiImages.expiry.src)
      ]);

      const model = new ChatOpenAI({
        apiKey: config.apiKey,
        model: config.model,
        temperature: 0,
        configuration: {
          baseURL: config.baseURL
        }
      });

      const response = await model.invoke([
        {
          role: "system",
          content:
            "你是用药信息结构化助手。只抽取图片中的药品和用法信息，不做诊断，不改处方。必须只输出严格 JSON，不能有 markdown、注释、前后缀文字。"
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "请识别三张图片（药盒正面、说明书、有效期）并返回严格 JSON，字段必须完全一致：\n{\n  \"plans\": [\n    {\n      \"name\": \"\",\n      \"dose\": \"\",\n      \"frequency\": \"\",\n      \"timing\": \"\",\n      \"days\": 30,\n      \"stock\": 14,\n      \"reminder\": \"08:30\",\n      \"revisit\": \"YYYY-MM-DD\",\n      \"expiryDate\": \"YYYY-MM-DD\",\n      \"purchaseReminder\": \"\"\n    }\n  ],\n  \"sourceSummary\": \"\",\n  \"riskNotice\": \"\"\n}\n\n约束：\n1) plans 至少 1 条。\n2) 日期必须是 YYYY-MM-DD。\n3) 如果图片无法识别某字段，用空字符串或合理默认值，不可省略字段。\n4) 若 expiryDate 距离今天 <= 30 天，purchaseReminder 需明确写出临期购药提醒。\n5) 仅返回 JSON 本体。"
            },
            {
              type: "image_url",
              image_url: { url: frontDataUrl }
            },
            {
              type: "image_url",
              image_url: { url: instructionDataUrl }
            },
            {
              type: "image_url",
              image_url: { url: expiryDataUrl }
            }
          ]
        }
      ]);

      const raw = String(response.content);
      const parsed = parseAiJson(raw);
      const normalizedPlans = parsed.plans.map((plan) => normalizeDraft(plan));

      setAiPreviewPlans(normalizedPlans);
      setAiSummary({
        sourceSummary: parsed.sourceSummary,
        riskNotice: parsed.riskNotice
      });
      setToast("已读取内置示例图片并生成可确认用药计划");
    } catch (error) {
      setAiSummary(null);
      setAiPreviewPlans([]);
      setToast(
        error instanceof Error ? `识别失败：${error.message}` : "识别失败，请检查网关、模型名或 API Key"
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
              images={aiImages}
              configReady={Boolean(config.apiKey && config.baseURL && config.model)}
              summary={aiSummary}
              previewPlans={aiPreviewPlans}
              isGenerating={isGenerating}
              onPlanChange={updateAiPreviewPlan}
              onGenerate={generateFromImages}
              onConfirm={confirmAiPlans}
              onOpenConfig={() => setTab("profile")}
            />
          )}
          {tab === "profile" && (
            <ProfilePage config={config} onConfigChange={setConfig} onClear={clearLocalData} />
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
    nearExpiry: number;
    expired: number;
    todayCount: number;
    nextPlan?: MedicationPlan;
  };
  plans: MedicationPlan[];
  onStartPlan: () => void;
  onStartAi: () => void;
}) {
  return (
    <>
      <section className="banner">
        <div>
          <p>24h 慢病陪伴</p>
          <h2>你只管忙，用药我来帮</h2>
          <span>
            今日 {stats.todayCount} 项提醒 · 临期 {stats.nearExpiry} 项 · 库存偏低 {stats.lowStock} 项
          </span>
        </div>
        <img className="mascot" src={mascotLogo} alt="药小团 logo" />
      </section>

      <section className="card">
        <CardTitle icon={<Clock3 />} title="今日服药" action="全部计划" onClick={onStartPlan} />
        <div className="timeline">
          {plans.slice(0, 3).map((plan) => {
            const expiryBadge = getExpiryBadge(plan.expiryDate);
            return (
              <div className="timeline-item" key={plan.id}>
                <span className="time">{plan.reminder}</span>
                <div>
                  <strong>{plan.name}</strong>
                  <p>
                    {plan.dose} · {plan.frequency} · {plan.timing}
                  </p>
                  <span className={`expiry-chip ${expiryBadge.className}`}>
                    {expiryBadge.label}
                    {expiryBadge.showReminder ? ` · ${plan.purchaseReminder}` : ""}
                  </span>
                </div>
                <span className="state">待提醒</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="split-row">
        <div className="mini-card">
          <span>下次复诊</span>
          <strong>{stats.nextPlan?.revisit ?? "未设置"}</strong>
          <p>{stats.nextPlan ? `${stats.nextPlan.name} 需带记录` : "添加计划后自动提醒"}</p>
        </div>
        <div className="mini-card alert">
          <span>药品有效期</span>
          <strong>
            临期 {stats.nearExpiry} 项 / 过期 {stats.expired} 项
          </strong>
          <p>临期药会自动显示购药提醒</p>
        </div>
      </section>

      <section className="doctor-strip">
        <div className="doctor-avatar">AI</div>
        <div>
          <strong>AI 图片识别建计划</strong>
          <p>上传药盒正面 + 说明书 + 有效期图，直接生成可确认计划</p>
        </div>
        <button type="button" onClick={onStartAi}>
          去识别
        </button>
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
  draft: PlanDraft;
  plans: MedicationPlan[];
  onDraftChange: (draft: PlanDraft) => void;
  onSave: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      <section className="card">
        <CardTitle icon={<CirclePlus />} title="新增用药计划" action="保存" onClick={onSave} />
        <div className="form-grid">
          <Field
            label="药品名称"
            value={draft.name}
            placeholder="如：酚麻美敏片"
            onChange={(name) => onDraftChange({ ...draft, name })}
          />
          <Field
            label="单次剂量"
            value={draft.dose}
            placeholder="如：2 片"
            onChange={(dose) => onDraftChange({ ...draft, dose })}
          />
          <Field
            label="服药频次"
            value={draft.frequency}
            placeholder="如：每日 3 次"
            onChange={(frequency) => onDraftChange({ ...draft, frequency })}
          />
          <Field
            label="服药时机"
            value={draft.timing}
            placeholder="如：餐后"
            onChange={(timing) => onDraftChange({ ...draft, timing })}
          />
          <Field
            label="计划天数"
            type="number"
            value={String(draft.days)}
            onChange={(days) => onDraftChange({ ...draft, days: Number(days) || 1 })}
          />
          <Field
            label="剩余库存"
            type="number"
            value={String(draft.stock)}
            onChange={(stock) => onDraftChange({ ...draft, stock: Number(stock) || 0 })}
          />
          <Field
            label="提醒时间"
            type="time"
            value={draft.reminder}
            onChange={(reminder) => onDraftChange({ ...draft, reminder })}
          />
          <Field
            label="复诊日期"
            type="date"
            value={draft.revisit}
            onChange={(revisit) => onDraftChange({ ...draft, revisit })}
          />
          <Field
            label="有效期至"
            type="date"
            value={draft.expiryDate}
            onChange={(expiryDate) => onDraftChange({ ...draft, expiryDate })}
          />
          <Field
            label="临期购药提醒"
            value={draft.purchaseReminder}
            placeholder="如：有效期不足30天请购药"
            onChange={(purchaseReminder) => onDraftChange({ ...draft, purchaseReminder })}
          />
        </div>
      </section>

      <section className="card">
        <CardTitle icon={<ClipboardList />} title="我的计划" action={`${plans.length} 项`} />
        <div className="plan-list">
          {plans.map((plan) => {
            const expiryBadge = getExpiryBadge(plan.expiryDate);
            return (
              <article className="plan-card" key={plan.id}>
                <div>
                  <strong>{plan.name}</strong>
                  <p>
                    {plan.dose} · {plan.frequency} · {plan.timing}
                  </p>
                  <span>{plan.reminder} 提醒 · {plan.revisit} 复诊</span>
                  <span className={`expiry-chip ${expiryBadge.className}`}>{expiryBadge.label}</span>
                  {expiryBadge.showReminder && (
                    <span className="purchase-tip">购药提醒：{plan.purchaseReminder || "该药已临期，请尽快购药"}</span>
                  )}
                </div>
                <div className="plan-side">
                  <span className={plan.stock <= 7 ? "stock low" : "stock"}>{plan.stock} 天</span>
                  <button type="button" aria-label={`删除 ${plan.name}`} onClick={() => onRemove(plan.id)}>
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}

function AiPage({
  images,
  configReady,
  summary,
  previewPlans,
  isGenerating,
  onPlanChange,
  onGenerate,
  onConfirm,
  onOpenConfig
}: {
  images: AiImageState;
  configReady: boolean;
  summary: { sourceSummary: string; riskNotice: string } | null;
  previewPlans: PlanDraft[];
  isGenerating: boolean;
  onPlanChange: (index: number, patch: Partial<PlanDraft>) => void;
  onGenerate: () => void;
  onConfirm: () => void;
  onOpenConfig: () => void;
}) {
  return (
    <>
      <section className="card ai-card">
        <CardTitle
          icon={<Bot />}
          title="AI 图片识别生成计划"
          action={configReady ? "已配置" : "去配置"}
          onClick={configReady ? undefined : onOpenConfig}
        />
        <p className="helper">
          当前为演示模式，固定使用三张内置样例图进行识别：正面图、说明书图、有效日期图。
          识别完成后展示可编辑字段，确认后再加入我的计划。
        </p>

        <div className="demo-image-grid">
          <DemoImageCard image={images.front} />
          <DemoImageCard image={images.instruction} />
          <DemoImageCard image={images.expiry} />
        </div>

        <button className="primary-button" type="button" onClick={onGenerate} disabled={isGenerating}>
          {isGenerating ? "正在识别并生成..." : "用当前图片生成计划"}
        </button>
      </section>

      <section className="card result-card">
        <CardTitle icon={<ShieldCheck />} title="识别结果确认" action="可编辑" />
        {!previewPlans.length ? (
          <div className="empty-state">
            <Bot size={30} />
            <p>生成后会在这里展示可编辑的用药字段哦～</p>
          </div>
        ) : (
          <div className="ai-summary">
            <p>{summary?.sourceSummary || "已基于示例图完成药品与说明信息提取。"}</p>
            {summary?.riskNotice && <p className="risk-text">风险提示：{summary.riskNotice}</p>}
          </div>
        )}

        {previewPlans.length > 0 && (
          <div className="ai-preview">
            <h3>待确认计划（{previewPlans.length} 条）</h3>
            {previewPlans.map((plan, index) => {
              const expiryBadge = getExpiryBadge(plan.expiryDate);
              return (
                <article className="plan-card editable-plan" key={`${plan.name}-${index}`}>
                  <div>
                    <strong>计划 {index + 1}</strong>
                    <div className="form-grid">
                      <Field label="药品名称" value={plan.name} onChange={(name) => onPlanChange(index, { name })} />
                      <Field label="单次剂量" value={plan.dose} onChange={(dose) => onPlanChange(index, { dose })} />
                      <Field
                        label="服药频次"
                        value={plan.frequency}
                        onChange={(frequency) => onPlanChange(index, { frequency })}
                      />
                      <Field label="服药时机" value={plan.timing} onChange={(timing) => onPlanChange(index, { timing })} />
                      <Field
                        label="计划天数"
                        type="number"
                        value={String(plan.days)}
                        onChange={(days) => onPlanChange(index, { days: Number(days) || 1 })}
                      />
                      <Field
                        label="剩余库存"
                        type="number"
                        value={String(plan.stock)}
                        onChange={(stock) => onPlanChange(index, { stock: Number(stock) || 0 })}
                      />
                      <Field
                        label="提醒时间"
                        type="time"
                        value={plan.reminder}
                        onChange={(reminder) => onPlanChange(index, { reminder })}
                      />
                      <Field
                        label="复诊日期"
                        type="date"
                        value={plan.revisit}
                        onChange={(revisit) => onPlanChange(index, { revisit })}
                      />
                      <Field
                        label="有效期至"
                        type="date"
                        value={plan.expiryDate}
                        onChange={(expiryDate) => onPlanChange(index, { expiryDate })}
                      />
                      <Field
                        label="购药提醒"
                        value={plan.purchaseReminder}
                        onChange={(purchaseReminder) => onPlanChange(index, { purchaseReminder })}
                      />
                    </div>
                    <span className={`expiry-chip ${expiryBadge.className}`}>{expiryBadge.label}</span>
                    {expiryBadge.showReminder && (
                      <span className="purchase-tip">
                        购药提醒：{plan.purchaseReminder || "该药已临期，请尽快购药"}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
            <button className="primary-button" type="button" onClick={onConfirm}>
              确认并添加到我的计划
            </button>
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
          <li>上传图片仅用于本次识别，是否持久化由用户决定。</li>
          <li>AI 输出只做提醒整理，不建议自行增减药量。</li>
        </ul>
        <button className="danger-button" type="button" onClick={onClear}>
          清理本地演示数据
        </button>
      </section>
    </>
  );
}

function DemoImageCard({ image }: { image: DemoImage }) {
  return (
    <article className="demo-image-card">
      <img src={image.src} alt={image.caption} />
      <div>
        <strong>{image.caption}</strong>
        <p>{image.name}</p>
      </div>
    </article>
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
    const raw = JSON.parse(saved) as Array<Partial<MedicationPlan>>;
    const normalized = raw.map((item) => normalizeSavedPlan(item));
    return normalized.length ? normalized : defaultPlans;
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

function normalizeSavedPlan(item: Partial<MedicationPlan>): MedicationPlan {
  return {
    id: item.id || crypto.randomUUID(),
    name: item.name || "未命名药品",
    dose: item.dose || "",
    frequency: item.frequency || "每日 1 次",
    timing: item.timing || "餐后",
    days: Number(item.days) > 0 ? Number(item.days) : 30,
    stock: Number(item.stock) >= 0 ? Number(item.stock) : 14,
    reminder: item.reminder || "08:30",
    revisit: normalizeDate(item.revisit, "2026-05-20"),
    expiryDate: normalizeDate(item.expiryDate, "2026-12-31"),
    purchaseReminder: item.purchaseReminder || "有效期不足 30 天时提醒购药"
  };
}

function normalizeDraft(draft: PlanDraft): PlanDraft {
  const normalizedExpiry = normalizeDate(draft.expiryDate, "2026-12-31");
  const leftDays = daysUntil(normalizedExpiry);
  const nearExpiry = leftDays >= 0 && leftDays <= 30;

  return {
    name: draft.name.trim() || "未命名药品",
    dose: draft.dose.trim() || "",
    frequency: draft.frequency.trim() || "每日 1 次",
    timing: draft.timing.trim() || "餐后",
    days: Number(draft.days) > 0 ? Number(draft.days) : 30,
    stock: Number(draft.stock) >= 0 ? Number(draft.stock) : 14,
    reminder: draft.reminder || "08:30",
    revisit: normalizeDate(draft.revisit, "2026-05-20"),
    expiryDate: normalizedExpiry,
    purchaseReminder:
      draft.purchaseReminder.trim() ||
      (nearExpiry ? "该药临近有效期，请尽快购药或联系药师确认可替代药品" : "有效期不足 30 天时提醒购药")
  };
}

function normalizeDate(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return fallback;
}

function parseAiJson(raw: string): AiPlanJson {
  const cleaned = raw.trim();
  const maybeJson = cleaned.startsWith("```") ? cleaned.replace(/^```json\s*|^```|```$/gim, "").trim() : cleaned;

  let parsed: unknown;
  try {
    parsed = JSON.parse(maybeJson);
  } catch {
    const start = maybeJson.indexOf("{");
    const end = maybeJson.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(maybeJson.slice(start, end + 1));
    } else {
      throw new Error("AI 未返回可解析的 JSON");
    }
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI 返回格式错误");
  }

  const data = parsed as Partial<AiPlanJson>;
  const plans = Array.isArray(data.plans) ? data.plans : [];
  if (!plans.length) {
    throw new Error("AI 未识别到可用的用药计划");
  }

  return {
    plans: plans.map((plan) => normalizeDraft((plan as PlanDraft) ?? emptyPlan)),
    sourceSummary: typeof data.sourceSummary === "string" ? data.sourceSummary : "",
    riskNotice: typeof data.riskNotice === "string" ? data.riskNotice : ""
  };
}

function daysUntil(dateText: string): number {
  const now = new Date();
  const target = new Date(`${dateText}T00:00:00`);

  if (Number.isNaN(target.getTime())) {
    return 9999;
  }

  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor((target.getTime() - now.getTime()) / oneDay);
}

function getExpiryBadge(expiryDate: string) {
  const leftDays = daysUntil(expiryDate);

  if (leftDays < 0) {
    return {
      className: "expired",
      label: `已过期（${expiryDate}）`,
      showReminder: true
    };
  }

  if (leftDays <= 30) {
    return {
      className: "near-expiry",
      label: `临近有效期：${expiryDate}（剩余 ${leftDays} 天）`,
      showReminder: true
    };
  }

  return {
    className: "safe-expiry",
    label: `有效期至：${expiryDate}`,
    showReminder: false
  };
}

function toDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

async function assetUrlToDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`示例图片加载失败：${url}`);
  }
  const blob = await response.blob();
  return toDataUrl(blob);
}

export default App;
