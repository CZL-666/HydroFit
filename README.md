# 个人管理

一个移动端优先的个人记录 App，沿用 Supabase 登录和云端保存。

## 功能

- 邮箱密码登录，登录状态自动保留
- 按杯记录每天喝水量
- 自定义每日喝水目标杯数
- 记录今天是否健身
- 支持切换月份查看历史
- 支持点击日期补签或修改历史记录
- 展示连续健身天数
- 展示今年累计健身天数
- 展示本月平均喝水杯数
- 单独展示本月喝水柱状图
- 单独展示本月健身打卡图

## 文件结构

- `login.html` / `login.js`：独立登录页
- `index.html` / `app.js`：主应用
- `config.js`：Supabase 公开配置
- `styles.css`：页面样式

## Supabase 建表

在 Supabase SQL Editor 执行：

```sql
create table if not exists public.daily_water_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_date date not null,
  cups integer not null default 0 check (cups >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, record_date)
);

create table if not exists public.daily_workout_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_date date not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, record_date)
);

alter table public.daily_water_records enable row level security;
alter table public.daily_workout_records enable row level security;

create policy "Users can read own water records"
on public.daily_water_records
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can upsert own water records"
on public.daily_water_records
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own water records"
on public.daily_water_records
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read own workout records"
on public.daily_workout_records
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can upsert own workout records"
on public.daily_workout_records
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own workout records"
on public.daily_workout_records
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

## 本地预览

```bash
node server.js
```

然后打开：

```text
http://localhost:5174/
```
