const TARGET_STORAGE_KEY = "personal-tracker-water-target";

const logoutBtn = document.querySelector("#logoutBtn");
const prevMonthBtn = document.querySelector("#prevMonthBtn");
const nextMonthBtn = document.querySelector("#nextMonthBtn");
const monthTitle = document.querySelector("#monthTitle");
const todayWaterCount = document.querySelector("#todayWaterCount");
const todayWaterMinusBtn = document.querySelector("#todayWaterMinusBtn");
const todayWaterPlusBtn = document.querySelector("#todayWaterPlusBtn");
const todayWorkoutStatus = document.querySelector("#todayWorkoutStatus");
const todayWorkoutBtn = document.querySelector("#todayWorkoutBtn");
const waterTargetInput = document.querySelector("#waterTargetInput");
const waterTargetText = document.querySelector("#waterTargetText");
const waterMonthSummary = document.querySelector("#waterMonthSummary");
const workoutMonthSummary = document.querySelector("#workoutMonthSummary");
const waterChart = document.querySelector("#waterChart");
const waterDays = document.querySelector("#waterDays");
const workoutCalendar = document.querySelector("#workoutCalendar");
const currentStreak = document.querySelector("#currentStreak");
const yearWorkoutDays = document.querySelector("#yearWorkoutDays");
const monthWaterAvg = document.querySelector("#monthWaterAvg");
const editDialog = document.querySelector("#editDialog");
const editDateTitle = document.querySelector("#editDateTitle");
const editWaterInput = document.querySelector("#editWaterInput");
const editWorkoutInput = document.querySelector("#editWorkoutInput");
const saveEditBtn = document.querySelector("#saveEditBtn");

let currentUser = null;
let waterRecords = [];
let workoutRecords = [];
let selectedMonth = new Date();
let editingDateKey = null;

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

function getMonthIdentity(date = selectedMonth) {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
  };
}

function getMonthDays(date = selectedMonth) {
  const { year, month } = getMonthIdentity(date);
  const totalDays = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: totalDays }, (_, index) => toDateKey(new Date(year, month, index + 1)));
}

function formatMonth(date = selectedMonth) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(date);
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

async function saveWaterCups(dateKey, cups) {
  const { data, error } = await supabaseClient
    .from(WATER_TABLE)
    .upsert({ user_id: currentUser.id, record_date: dateKey, cups }, { onConflict: "user_id,record_date" })
    .select("id, record_date, cups")
    .single();

  if (error) throw error;
  waterRecords = waterRecords.filter((record) => record.record_date !== dateKey).concat(data);
}

async function saveWorkout(dateKey, completed) {
  const { data, error } = await supabaseClient
    .from(WORKOUT_TABLE)
    .upsert({ user_id: currentUser.id, record_date: dateKey, completed }, { onConflict: "user_id,record_date" })
    .select("id, record_date, completed")
    .single();

  if (error) throw error;
  workoutRecords = workoutRecords.filter((record) => record.record_date !== dateKey).concat(data);
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

function getSelectedMonthStats() {
  const waterMap = getWaterMap();
  const workoutMap = getWorkoutMap();
  const days = getMonthDays();
  const today = toDateKey();
  const visibleDays = days.filter((dateKey) => dateKey <= today || dateKey.slice(0, 7) !== today.slice(0, 7));
  const waterTotal = visibleDays.reduce((sum, dateKey) => sum + (waterMap.get(dateKey) || 0), 0);
  const waterHitDays = visibleDays.filter((dateKey) => (waterMap.get(dateKey) || 0) >= getWaterTarget()).length;
  const workoutDays = visibleDays.filter((dateKey) => workoutMap.get(dateKey)).length;

  return {
    totalDays: visibleDays.length,
    waterAverage: visibleDays.length ? waterTotal / visibleDays.length : 0,
    waterHitDays,
    workoutDays,
  };
}

function renderHeader() {
  const today = new Date();
  const viewingCurrentMonth =
    selectedMonth.getFullYear() === today.getFullYear() && selectedMonth.getMonth() === today.getMonth();
  monthTitle.textContent = formatMonth();
  nextMonthBtn.disabled = viewingCurrentMonth;
}

function renderToday() {
  const waterMap = getWaterMap();
  const workoutMap = getWorkoutMap();
  const today = toDateKey();
  const cups = waterMap.get(today) || 0;
  const done = workoutMap.get(today) || false;
  todayWaterCount.textContent = String(cups);
  todayWorkoutStatus.textContent = done ? "已完成" : "未完成";
  todayWorkoutBtn.textContent = done ? "取消" : "完成";
  todayWorkoutBtn.classList.toggle("done", done);
  waterTargetText.textContent = String(getWaterTarget());
}

function renderMetrics() {
  const stats = getSelectedMonthStats();
  currentStreak.textContent = `${countCurrentWorkoutStreak()} 天`;
  yearWorkoutDays.textContent = `${countYearWorkouts()} 天`;
  monthWaterAvg.textContent = `${Number(stats.waterAverage.toFixed(1))} 杯`;
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
  const padding = { top: 18, right: 8, bottom: 28, left: 28 };
  const plotWidth = rect.width - padding.left - padding.right;
  const plotHeight = rect.height - padding.top - padding.bottom;
  const gap = 3;
  const barWidth = Math.max(4, (plotWidth - gap * (days.length - 1)) / days.length);
  const targetY = padding.top + plotHeight - (target / maxValue) * plotHeight;

  ctx.strokeStyle = "rgba(2, 132, 199, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, targetY);
  ctx.lineTo(rect.width - padding.right, targetY);
  ctx.stroke();

  ctx.fillStyle = "#65758a";
  ctx.font = "11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.fillText(`${target}杯`, 0, targetY + 4);

  days.forEach((dateKey, index) => {
    const value = values[index];
    const height = value ? Math.max(4, (value / maxValue) * plotHeight) : 2;
    const x = padding.left + index * (barWidth + gap);
    const y = padding.top + plotHeight - height;
    ctx.fillStyle = value >= target ? "#0f766e" : "#38bdf8";
    ctx.fillRect(x, y, barWidth, height);

    const day = parseDateKey(dateKey).getDate();
    if (day === 1 || day % 5 === 0 || dateKey === toDateKey()) {
      ctx.fillStyle = "#65758a";
      ctx.fillText(String(day), x - 1, rect.height - 8);
    }
  });
}

function renderWaterDays() {
  const waterMap = getWaterMap();
  waterDays.innerHTML = "";

  getMonthDays().forEach((dateKey) => {
    const cups = waterMap.get(dateKey) || 0;
    const button = document.createElement("button");
    button.className = "water-day";
    button.type = "button";
    button.dataset.date = dateKey;
    button.classList.toggle("hit", cups >= getWaterTarget());
    button.classList.toggle("today", dateKey === toDateKey());
    button.innerHTML = `<span>${parseDateKey(dateKey).getDate()}</span><strong>${cups}</strong>`;
    waterDays.appendChild(button);
  });
}

function renderWaterModule() {
  const stats = getSelectedMonthStats();
  waterMonthSummary.textContent = `日均 ${Number(stats.waterAverage.toFixed(1))} 杯，达标 ${stats.waterHitDays} 天`;
  drawWaterChart();
  renderWaterDays();
}

function renderWorkoutModule() {
  const workoutMap = getWorkoutMap();
  const stats = getSelectedMonthStats();
  workoutMonthSummary.textContent = `已练 ${stats.workoutDays} 天`;
  workoutCalendar.innerHTML = "";

  getMonthDays().forEach((dateKey) => {
    const button = document.createElement("button");
    button.className = "workout-day";
    button.type = "button";
    button.dataset.date = dateKey;
    button.classList.toggle("done", Boolean(workoutMap.get(dateKey)));
    button.classList.toggle("today", dateKey === toDateKey());
    button.textContent = String(parseDateKey(dateKey).getDate());
    workoutCalendar.appendChild(button);
  });
}

function render() {
  renderHeader();
  renderToday();
  renderMetrics();
  renderWaterModule();
  renderWorkoutModule();
}

function changeMonth(offset) {
  selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + offset, 1);
  render();
}

function openEditor(dateKey) {
  const waterMap = getWaterMap();
  const workoutMap = getWorkoutMap();
  editingDateKey = dateKey;
  editDateTitle.textContent = formatDateKey(dateKey);
  editWaterInput.value = String(waterMap.get(dateKey) || 0);
  editWorkoutInput.checked = Boolean(workoutMap.get(dateKey));
  editDialog.showModal();
}

prevMonthBtn.addEventListener("click", () => changeMonth(-1));
nextMonthBtn.addEventListener("click", () => changeMonth(1));

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  location.href = "./login.html";
});

todayWaterMinusBtn.addEventListener("click", async () => {
  await saveWaterCups(toDateKey(), Math.max(0, (getWaterMap().get(toDateKey()) || 0) - 1));
  render();
});

todayWaterPlusBtn.addEventListener("click", async () => {
  await saveWaterCups(toDateKey(), (getWaterMap().get(toDateKey()) || 0) + 1);
  render();
});

todayWorkoutBtn.addEventListener("click", async () => {
  await saveWorkout(toDateKey(), !(getWorkoutMap().get(toDateKey()) || false));
  render();
});

waterTargetInput.addEventListener("input", () => {
  localStorage.setItem(TARGET_STORAGE_KEY, waterTargetInput.value);
  render();
});

waterDays.addEventListener("click", (event) => {
  const button = event.target.closest(".water-day");
  if (button) openEditor(button.dataset.date);
});

workoutCalendar.addEventListener("click", (event) => {
  const button = event.target.closest(".workout-day");
  if (button) openEditor(button.dataset.date);
});

saveEditBtn.addEventListener("click", async () => {
  if (!editingDateKey) return;
  const cups = Math.max(0, Math.min(40, Math.round(Number(editWaterInput.value) || 0)));
  await Promise.all([saveWaterCups(editingDateKey, cups), saveWorkout(editingDateKey, editWorkoutInput.checked)]);
  editDialog.close();
  render();
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
