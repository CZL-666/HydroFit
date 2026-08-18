const TARGET_STORAGE_KEY = "personal-tracker-water-target";

const logoutBtn = document.querySelector("#logoutBtn");
const todayLabel = document.querySelector("#todayLabel");
const waterCount = document.querySelector("#waterCount");
const waterMinusBtn = document.querySelector("#waterMinusBtn");
const waterPlusBtn = document.querySelector("#waterPlusBtn");
const waterTargetInput = document.querySelector("#waterTargetInput");
const waterTargetText = document.querySelector("#waterTargetText");
const waterNote = document.querySelector("#waterNote");
const workoutStatus = document.querySelector("#workoutStatus");
const workoutToggleBtn = document.querySelector("#workoutToggleBtn");
const currentStreak = document.querySelector("#currentStreak");
const yearWorkoutDays = document.querySelector("#yearWorkoutDays");
const monthWaterAvg = document.querySelector("#monthWaterAvg");
const waterMonthSummary = document.querySelector("#waterMonthSummary");
const workoutMonthSummary = document.querySelector("#workoutMonthSummary");
const waterChart = document.querySelector("#waterChart");
const workoutCalendar = document.querySelector("#workoutCalendar");
const dayList = document.querySelector("#dayList");

let currentUser = null;
let waterRecords = [];
let workoutRecords = [];

function toDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function shiftDateKey(dateKey, offset) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
}

function getMonthStart() {
  const now = new Date();
  return toDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
}

function getMonthDays() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const totalDays = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: totalDays }, (_, index) => toDateKey(new Date(year, month, index + 1)));
}

function formatDateKey(dateKey) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(parseDateKey(dateKey));
}

function getWaterMap() {
  return new Map(waterRecords.map((record) => [record.record_date, Number(record.cups)]));
}

function getWorkoutMap() {
  return new Map(workoutRecords.map((record) => [record.record_date, Boolean(record.completed)]));
}

function getTodayWaterCups() {
  return getWaterMap().get(toDateKey()) || 0;
}

function isTodayWorkoutDone() {
  return getWorkoutMap().get(toDateKey()) || false;
}

function getWaterTarget() {
  const target = Number(waterTargetInput.value);
  return Number.isFinite(target) && target > 0 ? target : 8;
}

async function loadRecords() {
  const since = shiftDateKey(toDateKey(), -370);
  const [waterResult, workoutResult] = await Promise.all([
    supabaseClient.from(WATER_TABLE).select("id, record_date, cups").gte("record_date", since).order("record_date", { ascending: true }),
    supabaseClient.from(WORKOUT_TABLE).select("id, record_date, completed").gte("record_date", since).order("record_date", { ascending: true }),
  ]);

  if (waterResult.error) throw waterResult.error;
  if (workoutResult.error) throw workoutResult.error;
  waterRecords = waterResult.data || [];
  workoutRecords = workoutResult.data || [];
}

async function saveWaterCups(cups) {
  const recordDate = toDateKey();
  const { data, error } = await supabaseClient
    .from(WATER_TABLE)
    .upsert({ user_id: currentUser.id, record_date: recordDate, cups }, { onConflict: "user_id,record_date" })
    .select("id, record_date, cups")
    .single();

  if (error) throw error;
  waterRecords = waterRecords.filter((record) => record.record_date !== recordDate).concat(data);
}

async function saveWorkout(completed) {
  const recordDate = toDateKey();
  const { data, error } = await supabaseClient
    .from(WORKOUT_TABLE)
    .upsert({ user_id: currentUser.id, record_date: recordDate, completed }, { onConflict: "user_id,record_date" })
    .select("id, record_date, completed")
    .single();

  if (error) throw error;
  workoutRecords = workoutRecords.filter((record) => record.record_date !== recordDate).concat(data);
}

function countCurrentWorkoutStreak() {
  const workoutMap = getWorkoutMap();
  let streak = 0;
  let dateKey = toDateKey();
  while (workoutMap.get(dateKey)) {
    streak += 1;
    dateKey = shiftDateKey(dateKey, -1);
  }
  return streak;
}

function countYearWorkouts() {
  const year = new Date().getFullYear();
  return workoutRecords.filter((record) => record.completed && parseDateKey(record.record_date).getFullYear() === year).length;
}

function getMonthWaterStats() {
  const waterMap = getWaterMap();
  const days = getMonthDays();
  const today = toDateKey();
  const elapsedDays = days.filter((dateKey) => dateKey <= today);
  const total = elapsedDays.reduce((sum, dateKey) => sum + (waterMap.get(dateKey) || 0), 0);
  const hitDays = elapsedDays.filter((dateKey) => (waterMap.get(dateKey) || 0) >= getWaterTarget()).length;
  return {
    average: elapsedDays.length ? total / elapsedDays.length : 0,
    hitDays,
    elapsedDays: elapsedDays.length,
  };
}

function getMonthWorkoutStats() {
  const workoutMap = getWorkoutMap();
  const days = getMonthDays();
  const today = toDateKey();
  const elapsedDays = days.filter((dateKey) => dateKey <= today);
  const doneDays = elapsedDays.filter((dateKey) => workoutMap.get(dateKey)).length;
  return { doneDays, elapsedDays: elapsedDays.length };
}

function renderToday() {
  const cups = getTodayWaterCups();
  const target = getWaterTarget();
  const workoutDone = isTodayWorkoutDone();

  todayLabel.textContent = formatDateKey(toDateKey());
  waterCount.textContent = String(cups);
  waterTargetText.textContent = String(target);
  waterNote.textContent = cups >= target ? "今天喝水达标了。" : `今天还差 ${target - cups} 杯。`;
  workoutStatus.textContent = workoutDone ? "已完成" : "未完成";
  workoutToggleBtn.textContent = workoutDone ? "取消" : "完成";
  workoutToggleBtn.classList.toggle("done", workoutDone);
}

function renderSummary() {
  const waterStats = getMonthWaterStats();
  currentStreak.textContent = `${countCurrentWorkoutStreak()} 天`;
  yearWorkoutDays.textContent = `${countYearWorkouts()} 天`;
  monthWaterAvg.textContent = `${Number(waterStats.average.toFixed(1))} 杯`;
}

function drawWaterChart() {
  const ctx = waterChart.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = waterChart.getBoundingClientRect();
  waterChart.width = Math.max(1, Math.floor(rect.width * ratio));
  waterChart.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const target = getWaterTarget();
  const waterMap = getWaterMap();
  const days = getMonthDays();
  const values = days.map((dateKey) => waterMap.get(dateKey) || 0);
  const maxValue = Math.max(target, ...values, 1);
  const padding = { top: 18, right: 10, bottom: 28, left: 28 };
  const plotWidth = rect.width - padding.left - padding.right;
  const plotHeight = rect.height - padding.top - padding.bottom;
  const barGap = 3;
  const barWidth = Math.max(4, (plotWidth - barGap * (days.length - 1)) / days.length);
  const targetY = padding.top + plotHeight - (target / maxValue) * plotHeight;

  ctx.strokeStyle = "rgba(14, 116, 144, 0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, targetY);
  ctx.lineTo(rect.width - padding.right, targetY);
  ctx.stroke();

  ctx.fillStyle = "#64748b";
  ctx.font = "11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.fillText(`${target}杯`, 0, targetY + 4);

  days.forEach((dateKey, index) => {
    const value = values[index];
    const height = value ? Math.max(4, (value / maxValue) * plotHeight) : 2;
    const x = padding.left + index * (barWidth + barGap);
    const y = padding.top + plotHeight - height;
    ctx.fillStyle = value >= target ? "#0f766e" : "#38bdf8";
    ctx.fillRect(x, y, barWidth, height);

    const day = parseDateKey(dateKey).getDate();
    if (day === 1 || day % 5 === 0 || dateKey === toDateKey()) {
      ctx.fillStyle = "#64748b";
      ctx.fillText(String(day), x - 1, rect.height - 8);
    }
  });
}

function renderWaterModule() {
  const stats = getMonthWaterStats();
  waterMonthSummary.textContent = `已过 ${stats.elapsedDays} 天，达标 ${stats.hitDays} 天`;
  drawWaterChart();
}

function renderWorkoutModule() {
  const workoutMap = getWorkoutMap();
  const days = getMonthDays();
  const stats = getMonthWorkoutStats();
  workoutMonthSummary.textContent = `本月已练 ${stats.doneDays} 天`;
  workoutCalendar.innerHTML = "";

  days.forEach((dateKey) => {
    const day = document.createElement("div");
    day.className = "workout-day";
    day.classList.toggle("done", Boolean(workoutMap.get(dateKey)));
    day.classList.toggle("today", dateKey === toDateKey());
    day.textContent = String(parseDateKey(dateKey).getDate());
    workoutCalendar.appendChild(day);
  });
}

function renderRecentList() {
  const waterMap = getWaterMap();
  const workoutMap = getWorkoutMap();
  const today = toDateKey();
  dayList.innerHTML = "";

  Array.from({ length: 14 }, (_, index) => shiftDateKey(today, -index)).forEach((dateKey) => {
    const item = document.createElement("li");
    item.className = "day-item";
    item.innerHTML = `
      <div>
        <strong>${dateKey === today ? "今天" : formatDateKey(dateKey)}</strong>
        <span>${dateKey}</span>
      </div>
      <div class="day-tags">
        <span class="tag water">${waterMap.get(dateKey) || 0} 杯</span>
        <span class="tag workout">${workoutMap.get(dateKey) ? "已练" : "未练"}</span>
      </div>
    `;
    dayList.appendChild(item);
  });
}

function render() {
  renderToday();
  renderSummary();
  renderWaterModule();
  renderWorkoutModule();
  renderRecentList();
}

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  location.href = "./login.html";
});

waterMinusBtn.addEventListener("click", async () => {
  try {
    await saveWaterCups(Math.max(0, getTodayWaterCups() - 1));
    render();
  } catch (error) {
    waterNote.textContent = error.message || "保存失败，请稍后重试。";
  }
});

waterPlusBtn.addEventListener("click", async () => {
  try {
    await saveWaterCups(getTodayWaterCups() + 1);
    render();
  } catch (error) {
    waterNote.textContent = error.message || "保存失败，请稍后重试。";
  }
});

waterTargetInput.addEventListener("input", () => {
  localStorage.setItem(TARGET_STORAGE_KEY, waterTargetInput.value);
  render();
});

workoutToggleBtn.addEventListener("click", async () => {
  try {
    await saveWorkout(!isTodayWorkoutDone());
    render();
  } catch {
    workoutStatus.textContent = "保存失败";
  }
});

window.addEventListener("resize", drawWaterChart);

async function init() {
  waterTargetInput.value = localStorage.getItem(TARGET_STORAGE_KEY) || "8";
  const {
    data: { session },
    error,
  } = await supabaseClient.auth.getSession();

  if (error || !session) {
    location.href = "./login.html";
    return;
  }

  currentUser = session.user;
  await loadRecords();
  render();
}

init();
