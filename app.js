const TARGET_STORAGE_KEY = "personal-tracker-water-target";
const $ = (selector) => document.querySelector(selector);

const elements = {
  logoutBtn: $("#logoutBtn"), todayLabel: $("#todayLabel"), viewTabs: $(".view-tabs"),
  prevPeriodBtn: $("#prevPeriodBtn"), nextPeriodBtn: $("#nextPeriodBtn"), goTodayBtn: $("#goTodayBtn"),
  periodPickerBtn: $("#periodPickerBtn"), periodTitle: $("#periodTitle"), monthPicker: $("#monthPicker"),
  todayWaterCount: $("#todayWaterCount"), todayWaterMinusBtn: $("#todayWaterMinusBtn"), todayWaterPlusBtn: $("#todayWaterPlusBtn"),
  todayWorkoutStatus: $("#todayWorkoutStatus"), todayWorkoutBtn: $("#todayWorkoutBtn"),
  waterPrimaryStat: $("#waterPrimaryStat"), waterPrimaryLabel: $("#waterPrimaryLabel"), waterSummary: $("#waterSummary"),
  waterTargetText: $("#waterTargetText"), targetBtn: $("#targetBtn"), waterChart: $("#waterChart"), waterEmpty: $("#waterEmpty"),
  waterDays: $("#waterDays"), waterCalendarBlock: $("#waterCalendarBlock"),
  workoutPrimaryStat: $("#workoutPrimaryStat"), workoutPrimaryLabel: $("#workoutPrimaryLabel"),
  currentStreak: $("#currentStreak"), yearWorkoutDays: $("#yearWorkoutDays"), longestStreak: $("#longestStreak"),
  workoutGrid: $("#workoutGrid"), workoutWeekdays: $("#workoutWeekdays"), workoutSummary: $("#workoutSummary"),
  editDialog: $("#editDialog"), editDateTitle: $("#editDateTitle"), editWaterInput: $("#editWaterInput"),
  editWorkoutInput: $("#editWorkoutInput"), saveEditBtn: $("#saveEditBtn"), editNote: $("#editNote"),
  targetDialog: $("#targetDialog"), targetInput: $("#targetInput"), saveTargetBtn: $("#saveTargetBtn"), toast: $("#toast"),
};

let currentUser = null;
let waterRecords = [];
let workoutRecords = [];
let viewMode = "month";
let selectedDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let editingDateKey = null;
let toastTimer = null;

function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function shiftDateKey(key, offset) {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
}

function getWaterTarget() {
  const value = Number(localStorage.getItem(TARGET_STORAGE_KEY) || 8);
  return Number.isFinite(value) && value > 0 ? value : 8;
}

function getWaterMap() {
  return new Map(waterRecords.map((item) => [item.record_date, Number(item.cups)]));
}

function getWorkoutMap() {
  return new Map(workoutRecords.map((item) => [item.record_date, Boolean(item.completed)]));
}

function getMonthDays(date = selectedDate) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: count }, (_, index) => toDateKey(new Date(year, month, index + 1)));
}

function getYearMonths(year = selectedDate.getFullYear()) {
  return Array.from({ length: 12 }, (_, month) => new Date(year, month, 1));
}

function getRelevantDays(days) {
  const today = toDateKey();
  return days.filter((key) => key <= today);
}

function getWaterStats(days) {
  const relevantDays = getRelevantDays(days);
  const map = getWaterMap();
  const total = relevantDays.reduce((sum, key) => sum + (map.get(key) || 0), 0);
  const recorded = relevantDays.filter((key) => map.has(key) && map.get(key) > 0);
  return {
    total,
    average: recorded.length ? total / recorded.length : 0,
    recordedDays: recorded.length,
    hitDays: recorded.filter((key) => map.get(key) >= getWaterTarget()).length,
  };
}

function getWorkoutDays(days) {
  const map = getWorkoutMap();
  return getRelevantDays(days).filter((key) => map.get(key)).length;
}

function countStreak(endKey = toDateKey()) {
  const map = getWorkoutMap();
  let key = endKey;
  if (!map.get(key)) key = shiftDateKey(key, -1);
  let count = 0;
  while (map.get(key)) {
    count += 1;
    key = shiftDateKey(key, -1);
  }
  return count;
}

function countLongestStreak(year) {
  const keys = workoutRecords
    .filter((item) => item.completed && parseDateKey(item.record_date).getFullYear() === year)
    .map((item) => item.record_date)
    .sort();
  let longest = 0;
  let current = 0;
  let previous = null;
  keys.forEach((key) => {
    current = previous && shiftDateKey(previous, 1) === key ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = key;
  });
  return longest;
}

function countYearWorkouts(year) {
  return workoutRecords.filter((item) => item.completed && parseDateKey(item.record_date).getFullYear() === year).length;
}

function showToast(message, error = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", error);
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

async function loadRecords() {
  const since = `${selectedDate.getFullYear() - 1}-01-01`;
  const until = `${selectedDate.getFullYear() + 1}-12-31`;
  const [waterResult, workoutResult] = await Promise.all([
    supabaseClient.from(WATER_TABLE).select("id, record_date, cups").gte("record_date", since).lte("record_date", until).order("record_date"),
    supabaseClient.from(WORKOUT_TABLE).select("id, record_date, completed").gte("record_date", since).lte("record_date", until).order("record_date"),
  ]);
  if (waterResult.error) throw waterResult.error;
  if (workoutResult.error) throw workoutResult.error;
  waterRecords = waterResult.data || [];
  workoutRecords = workoutResult.data || [];
}

async function saveWaterCups(dateKey, cups) {
  const { data, error } = await supabaseClient.from(WATER_TABLE)
    .upsert({ user_id: currentUser.id, record_date: dateKey, cups }, { onConflict: "user_id,record_date" })
    .select("id, record_date, cups").single();
  if (error) throw error;
  waterRecords = waterRecords.filter((item) => item.record_date !== dateKey).concat(data);
}

async function saveWorkout(dateKey, completed) {
  const { data, error } = await supabaseClient.from(WORKOUT_TABLE)
    .upsert({ user_id: currentUser.id, record_date: dateKey, completed }, { onConflict: "user_id,record_date" })
    .select("id, record_date, completed").single();
  if (error) throw error;
  workoutRecords = workoutRecords.filter((item) => item.record_date !== dateKey).concat(data);
}

function renderHeader() {
  const now = new Date();
  elements.todayLabel.textContent = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(now);
  elements.periodTitle.textContent = viewMode === "month"
    ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(selectedDate)
    : `${selectedDate.getFullYear()} 年`;
  elements.monthPicker.value = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}`;
  elements.monthPicker.max = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const atCurrent = viewMode === "month"
    ? selectedDate.getFullYear() === now.getFullYear() && selectedDate.getMonth() === now.getMonth()
    : selectedDate.getFullYear() === now.getFullYear();
  elements.nextPeriodBtn.disabled = atCurrent;
  elements.goTodayBtn.hidden = atCurrent;
  elements.viewTabs.querySelectorAll("button").forEach((button) => {
    const active = button.dataset.view === viewMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function renderToday() {
  const today = toDateKey();
  const cups = getWaterMap().get(today) || 0;
  const done = Boolean(getWorkoutMap().get(today));
  elements.todayWaterCount.textContent = cups;
  elements.todayWorkoutStatus.textContent = done ? "已完成" : "未完成";
  elements.todayWorkoutBtn.classList.toggle("done", done);
}

function makeSummary(items) {
  return items.map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join("");
}

function renderWaterSummary() {
  const year = selectedDate.getFullYear();
  if (viewMode === "month") {
    const stats = getWaterStats(getMonthDays());
    elements.waterPrimaryStat.textContent = `${stats.total}`;
    elements.waterPrimaryLabel.textContent = "本月总杯数";
    elements.waterSummary.innerHTML = makeSummary([
      [stats.average ? stats.average.toFixed(1) : "0", "记录日平均"],
      [stats.recordedDays, "有记录天数"],
      [stats.hitDays, "达到参考目标"],
    ]);
  } else {
    const days = getYearMonths(year).flatMap((date) => getMonthDays(date));
    const stats = getWaterStats(days);
    elements.waterPrimaryStat.textContent = `${stats.total}`;
    elements.waterPrimaryLabel.textContent = "全年总杯数";
    elements.waterSummary.innerHTML = makeSummary([
      [stats.average ? stats.average.toFixed(1) : "0", "记录日平均"],
      [stats.recordedDays, "全年记录天数"],
      [stats.hitDays, "达到参考目标"],
    ]);
  }
  elements.waterTargetText.textContent = getWaterTarget();
}

function drawWaterChart() {
  const canvas = elements.waterChart;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const map = getWaterMap();
  let values;
  let labels;
  if (viewMode === "month") {
    const days = getMonthDays();
    values = days.map((key) => map.get(key) || 0);
    labels = days.map((key) => parseDateKey(key).getDate());
  } else {
    const months = getYearMonths();
    values = months.map((date) => Number(getWaterStats(getMonthDays(date)).average.toFixed(1)));
    labels = months.map((date) => date.getMonth() + 1);
  }

  elements.waterEmpty.hidden = values.some((value) => value > 0);
  const padding = { top: 22, right: 8, bottom: 30, left: 30 };
  const width = rect.width - padding.left - padding.right;
  const height = rect.height - padding.top - padding.bottom;
  const target = getWaterTarget();
  const max = Math.max(target + 2, ...values, 10);
  const xStep = width / Math.max(values.length - 1, 1);

  ctx.strokeStyle = "#e7e2d8";
  ctx.lineWidth = 1;
  [0, 0.5, 1].forEach((portion) => {
    const y = padding.top + height * portion;
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(rect.width - padding.right, y); ctx.stroke();
  });

  const targetY = padding.top + height - (target / max) * height;
  ctx.save();
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = "#8ba6a0";
  ctx.beginPath(); ctx.moveTo(padding.left, targetY); ctx.lineTo(rect.width - padding.right, targetY); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#71817e";
  ctx.font = "11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.fillText(`${target}杯`, 0, targetY + 4);

  const points = values.map((value, index) => ({
    x: padding.left + index * xStep,
    y: padding.top + height - (value / max) * height,
    value,
  }));
  if (points.length) {
    const area = ctx.createLinearGradient(0, padding.top, 0, padding.top + height);
    area.addColorStop(0, "rgba(35, 126, 143, .28)");
    area.addColorStop(1, "rgba(35, 126, 143, 0)");
    ctx.beginPath(); ctx.moveTo(points[0].x, padding.top + height);
    points.forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.lineTo(points[points.length - 1].x, padding.top + height); ctx.closePath(); ctx.fillStyle = area; ctx.fill();
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.strokeStyle = "#237e8f"; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
  }

  ctx.fillStyle = "#77766f";
  ctx.font = "11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  labels.forEach((label, index) => {
    const show = viewMode === "year" || index === 0 || (index + 1) % 5 === 0 || index === labels.length - 1;
    if (show) ctx.fillText(viewMode === "year" ? `${label}月` : `${label}`, padding.left + index * xStep - 6, rect.height - 8);
  });
}

function appendCalendarOffsets(container, date) {
  const mondayBased = (new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) % 7;
  for (let index = 0; index < mondayBased; index += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-spacer";
    container.appendChild(spacer);
  }
}

function renderWaterCalendar() {
  elements.waterDays.innerHTML = "";
  elements.waterCalendarBlock.hidden = viewMode === "year";
  if (viewMode === "year") return;
  appendCalendarOffsets(elements.waterDays, selectedDate);
  const map = getWaterMap();
  getMonthDays().forEach((key) => {
    const cups = map.get(key) || 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "water-day";
    button.dataset.date = key;
    button.classList.toggle("has-value", cups > 0);
    button.classList.toggle("hit", cups >= getWaterTarget());
    button.classList.toggle("today", key === toDateKey());
    button.disabled = key > toDateKey();
    button.innerHTML = `<span>${parseDateKey(key).getDate()}</span><strong>${cups || "·"}</strong>`;
    elements.waterDays.appendChild(button);
  });
}

function renderWorkout() {
  const year = selectedDate.getFullYear();
  const monthDays = getMonthDays();
  const monthDone = getWorkoutDays(monthDays);
  elements.currentStreak.textContent = `${countStreak()} 天`;
  elements.yearWorkoutDays.textContent = `${countYearWorkouts(new Date().getFullYear())} 天`;
  elements.longestStreak.textContent = `${countLongestStreak(new Date().getFullYear())} 天`;
  elements.workoutGrid.innerHTML = "";

  if (viewMode === "month") {
    elements.workoutPrimaryStat.textContent = monthDone;
    elements.workoutPrimaryLabel.textContent = "本月完成";
    elements.workoutSummary.textContent = monthDone ? `这个月有 ${monthDone} 天完成了健身，点击日期可以补签或修改。` : "这个月还没有健身记录，点击日期可以补签。";
    elements.workoutWeekdays.hidden = false;
    appendCalendarOffsets(elements.workoutGrid, selectedDate);
    const map = getWorkoutMap();
    monthDays.forEach((key) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "workout-day";
      button.dataset.date = key;
      button.classList.toggle("done", Boolean(map.get(key)));
      button.classList.toggle("today", key === toDateKey());
      button.disabled = key > toDateKey();
      button.innerHTML = `<span>${parseDateKey(key).getDate()}</span><i>✓</i>`;
      elements.workoutGrid.appendChild(button);
    });
    return;
  }

  const yearDone = countYearWorkouts(year);
  elements.workoutPrimaryStat.textContent = yearDone;
  elements.workoutPrimaryLabel.textContent = "全年完成";
  elements.workoutSummary.textContent = `${year} 年各月健身天数，点击月份进入月度日历。`;
  elements.workoutWeekdays.hidden = true;
  elements.workoutGrid.className = "workout-grid year-grid";
  getYearMonths(year).forEach((date) => {
    const done = getWorkoutDays(getMonthDays(date));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "year-month";
    button.dataset.month = date.getMonth();
    button.innerHTML = `<span>${date.getMonth() + 1}月</span><strong>${done}</strong><em>天</em><i style="--level:${Math.min(done / 12, 1)}"></i>`;
    elements.workoutGrid.appendChild(button);
  });
}

function render() {
  elements.workoutGrid.className = "workout-grid";
  renderHeader();
  renderToday();
  renderWaterSummary();
  drawWaterChart();
  renderWaterCalendar();
  renderWorkout();
}

async function changePeriod(offset) {
  selectedDate = viewMode === "month"
    ? new Date(selectedDate.getFullYear(), selectedDate.getMonth() + offset, 1)
    : new Date(selectedDate.getFullYear() + offset, 0, 1);
  await loadRecords();
  render();
}

async function setViewMode(mode) {
  viewMode = mode;
  if (mode === "year") selectedDate = new Date(selectedDate.getFullYear(), 0, 1);
  await loadRecords();
  render();
}

function openEditor(dateKey) {
  if (dateKey > toDateKey()) return;
  editingDateKey = dateKey;
  elements.editDateTitle.textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(parseDateKey(dateKey));
  elements.editWaterInput.value = getWaterMap().get(dateKey) || 0;
  elements.editWorkoutInput.checked = Boolean(getWorkoutMap().get(dateKey));
  elements.editNote.textContent = "";
  elements.editDialog.showModal();
}

async function updateToday(type) {
  const key = toDateKey();
  try {
    if (type === "minus") await saveWaterCups(key, Math.max(0, (getWaterMap().get(key) || 0) - 1));
    if (type === "plus") await saveWaterCups(key, (getWaterMap().get(key) || 0) + 1);
    if (type === "workout") await saveWorkout(key, !getWorkoutMap().get(key));
    render();
  } catch (error) {
    showToast(error.message || "保存失败", true);
  }
}

elements.viewTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-view]");
  if (button && button.dataset.view !== viewMode) setViewMode(button.dataset.view);
});
elements.prevPeriodBtn.addEventListener("click", () => changePeriod(-1));
elements.nextPeriodBtn.addEventListener("click", () => changePeriod(1));
elements.goTodayBtn.addEventListener("click", async () => {
  const now = new Date(); selectedDate = new Date(now.getFullYear(), viewMode === "month" ? now.getMonth() : 0, 1); await loadRecords(); render();
});
elements.periodPickerBtn.addEventListener("click", () => {
  if (viewMode === "month" && elements.monthPicker.showPicker) elements.monthPicker.showPicker();
  else elements.monthPicker.click();
});
elements.monthPicker.addEventListener("change", async () => {
  if (!elements.monthPicker.value) return;
  const [year, month] = elements.monthPicker.value.split("-").map(Number);
  selectedDate = new Date(year, viewMode === "month" ? month - 1 : 0, 1); await loadRecords(); render();
});
elements.waterDays.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-date]"); if (button) openEditor(button.dataset.date);
});
elements.workoutGrid.addEventListener("click", (event) => {
  const day = event.target.closest("button[data-date]"); if (day) openEditor(day.dataset.date);
  const month = event.target.closest("button[data-month]");
  if (month) { selectedDate = new Date(selectedDate.getFullYear(), Number(month.dataset.month), 1); setViewMode("month"); }
});
elements.todayWaterMinusBtn.addEventListener("click", () => updateToday("minus"));
elements.todayWaterPlusBtn.addEventListener("click", () => updateToday("plus"));
elements.todayWorkoutBtn.addEventListener("click", () => updateToday("workout"));
elements.targetBtn.addEventListener("click", () => { elements.targetInput.value = getWaterTarget(); elements.targetDialog.showModal(); });
elements.saveTargetBtn.addEventListener("click", () => {
  const target = Math.max(1, Math.min(30, Math.round(Number(elements.targetInput.value) || 8)));
  localStorage.setItem(TARGET_STORAGE_KEY, target); elements.targetDialog.close(); render(); showToast("参考目标已更新");
});
elements.saveEditBtn.addEventListener("click", async () => {
  if (!editingDateKey) return;
  elements.saveEditBtn.disabled = true; elements.saveEditBtn.textContent = "保存中...";
  try {
    const cups = Math.max(0, Math.min(40, Math.round(Number(elements.editWaterInput.value) || 0)));
    await Promise.all([saveWaterCups(editingDateKey, cups), saveWorkout(editingDateKey, elements.editWorkoutInput.checked)]);
    elements.editDialog.close(); render(); showToast("记录已保存");
  } catch (error) {
    elements.editNote.textContent = error.message || "保存失败，请重试。";
  } finally {
    elements.saveEditBtn.disabled = false; elements.saveEditBtn.textContent = "保存记录";
  }
});
elements.logoutBtn.addEventListener("click", async () => { await supabaseClient.auth.signOut(); location.href = "./login.html"; });
window.addEventListener("resize", drawWaterChart);

async function init() {
  if (!localStorage.getItem(TARGET_STORAGE_KEY)) localStorage.setItem(TARGET_STORAGE_KEY, "8");
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session) { location.href = "./login.html"; return; }
  currentUser = session.user;
  try { await loadRecords(); render(); } catch (loadError) { showToast(loadError.message || "数据加载失败", true); }
}

init();
