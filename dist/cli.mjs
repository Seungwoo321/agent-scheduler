#!/usr/bin/env node

// src/cli.mjs
import { readFile as readFile3, open as open2, link, rm as rm2 } from "node:fs/promises";
import { randomBytes as randomBytes2 } from "node:crypto";
import { join as join3 } from "node:path";
import { homedir } from "node:os";
import { spawn as spawn2 } from "node:child_process";
import { fileURLToPath } from "node:url";

// src/core.mjs
import { mkdir, readFile, writeFile, rename, readdir, rm, open, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID, createHash as createHash2 } from "node:crypto";
import { hostname } from "node:os";

// node_modules/croner/dist/croner.js
function w(i3) {
  return Date.UTC(i3.y, i3.m - 1, i3.d, i3.h, i3.i, i3.s);
}
function C(i3, e) {
  return i3.y === e.y && i3.m === e.m && i3.d === e.d && i3.h === e.h && i3.i === e.i && i3.s === e.s;
}
function O(i3) {
  let e = i3.substring(9);
  return e.includes("Z") || e.includes("+") || e.includes("-");
}
function j(i3, e) {
  let t = new Date(Date.parse(i3));
  if (isNaN(t)) throw new Error("Invalid ISO8601 passed to timezone parser.");
  return O(i3) ? { tp: y(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds(), "Etc/UTC"), ms: t.getUTCMilliseconds() } : { tp: y(t.getFullYear(), t.getMonth() + 1, t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds(), e), ms: t.getMilliseconds() };
}
function D(i3, e, t) {
  let { tp: n, ms: s } = j(i3, e);
  return new Date(P(n, t).getTime() + s);
}
function P(i3, e) {
  let t = v(i3);
  if (t.kind === "single") return t.date;
  if (t.kind === "ambiguous") return t.earlier;
  if (e) throw new Error("Invalid date passed to fromTZ()");
  return t.after;
}
function v(i3) {
  let e = w(i3), t = (a) => M(new Date(a), i3.tz), n = e - t(e), s = g(new Date(n), i3.tz);
  if (C(s, i3)) {
    let a = w(s) - n, o = n - (t(n - x) - a);
    if (o < n && C(g(new Date(o), i3.tz), i3)) return { kind: "ambiguous", earlier: new Date(o), later: new Date(n) };
    let u = n + (a - t(n + x));
    return u > n && C(g(new Date(u), i3.tz), i3) ? { kind: "ambiguous", earlier: new Date(n), later: new Date(u) } : { kind: "single", date: new Date(n) };
  }
  let r = e - (w(s) - n);
  return C(g(new Date(r), i3.tz), i3) ? { kind: "single", date: new Date(r) } : { kind: "gap", before: new Date(Math.min(n, r)), after: new Date(Math.max(n, r)) };
}
var x = 3 * 36e5;
function M(i3, e) {
  return w(g(i3, e)) - (i3.getTime() - i3.getUTCMilliseconds());
}
function _(i3, e, t) {
  let n = M(new Date(i3), t);
  for (; e - i3 > 1e3; ) {
    let s = i3 + Math.floor((e - i3) / 2e3) * 1e3;
    M(new Date(s), t) === n ? i3 = s : e = s;
  }
  return e;
}
function U(i3, e) {
  let t = v(g(new Date(i3), e));
  if (t.kind === "ambiguous") return i3 < t.later.getTime() ? "earlier" : "later";
}
var E = /* @__PURE__ */ new Map();
function g(i3, e) {
  if (e === void 0) return y(i3.getFullYear(), i3.getMonth() + 1, i3.getDate(), i3.getHours(), i3.getMinutes(), i3.getSeconds());
  let t = E.get(e), n;
  try {
    t || (t = new Intl.DateTimeFormat("en-US", { timeZone: e, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hour12: false }), E.set(e, t)), n = t.formatToParts(i3);
  } catch (r) {
    let a = r instanceof Error ? r.message : String(r);
    throw new RangeError(`toTZ: Invalid timezone '${e}' or date. Please provide a valid IANA timezone (e.g., 'America/New_York', 'Europe/Stockholm'). Original error: ${a}`);
  }
  let s = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (let r of n) (r.type === "year" || r.type === "month" || r.type === "day" || r.type === "hour" || r.type === "minute" || r.type === "second") && (s[r.type] = parseInt(r.value, 10));
  if (isNaN(s.year) || isNaN(s.month) || isNaN(s.day) || isNaN(s.hour) || isNaN(s.minute) || isNaN(s.second)) throw new Error(`toTZ: Failed to parse all date components from timezone '${e}'. This may indicate an invalid date or timezone configuration. Parsed components: ${JSON.stringify(s)}`);
  return s.hour === 24 && (s.hour = 0), { y: s.year, m: s.month, d: s.day, h: s.hour, i: s.minute, s: s.second, tz: e };
}
function y(i3, e, t, n, s, r, a) {
  return { y: i3, m: e, d: t, h: n, i: s, s: r, tz: a };
}
var R = [1, 2, 4, 8, 16];
var b = class i {
  pattern;
  timezone;
  mode;
  alternativeWeekdays;
  sloppyRanges;
  second;
  minute;
  hour;
  day;
  month;
  dayOfWeek;
  year;
  lastDayOfMonth;
  lastWeekday;
  nearestWeekdays;
  starDOM;
  starDOW;
  starYear;
  useAndLogic;
  isFixedTime;
  constructor(e, t, n) {
    this.pattern = e, this.timezone = t, this.mode = n?.mode ?? "auto", this.alternativeWeekdays = n?.alternativeWeekdays ?? false, this.sloppyRanges = n?.sloppyRanges ?? false, this.second = Array(60).fill(0), this.minute = Array(60).fill(0), this.hour = Array(24).fill(0), this.day = Array(31).fill(0), this.month = Array(12).fill(0), this.dayOfWeek = Array(7).fill(0), this.year = Array(1e4).fill(0), this.lastDayOfMonth = false, this.lastWeekday = false, this.nearestWeekdays = Array(31).fill(0), this.starDOM = false, this.starDOW = false, this.starYear = false, this.useAndLogic = false, this.isFixedTime = false, this.parse();
  }
  parse() {
    if (!(typeof this.pattern == "string" || this.pattern instanceof String)) throw new TypeError("CronPattern: Pattern has to be of type string.");
    this.pattern.indexOf("@") >= 0 && (this.pattern = this.handleNicknames(this.pattern).trim());
    let e = this.pattern.match(/\S+/g) || [""], t = e.length;
    if (e.length < 5 || e.length > 7) throw new TypeError("CronPattern: invalid configuration format ('" + this.pattern + "'), exactly five, six, or seven space separated parts are required.");
    if (this.mode !== "auto") {
      let r;
      switch (this.mode) {
        case "5-part":
          r = 5;
          break;
        case "6-part":
          r = 6;
          break;
        case "7-part":
          r = 7;
          break;
        case "5-or-6-parts":
          r = [5, 6];
          break;
        case "6-or-7-parts":
          r = [6, 7];
          break;
        default:
          r = 0;
      }
      if (!(Array.isArray(r) ? r.includes(t) : t === r)) {
        let o = Array.isArray(r) ? r.join(" or ") : r.toString();
        throw new TypeError(`CronPattern: mode '${this.mode}' requires exactly ${o} parts, but pattern '${this.pattern}' has ${t} parts.`);
      }
    }
    if (e.length === 5 && e.unshift("0"), e.length === 6 && e.push("*"), this.pattern.indexOf("?") >= 0) for (let r = 0; r < e.length; r++) e[r] = e[r].replace(/\?/g, "*");
    if (e[3].toUpperCase() === "LW" ? (this.lastWeekday = true, e[3] = "") : e[3].toUpperCase().indexOf("L") >= 0 && (e[3] = e[3].replace(/L/gi, ""), this.lastDayOfMonth = true), e[3] == "*" && (this.starDOM = true), e[6] == "*" && (this.starYear = true), e[4].length >= 3 && (e[4] = this.replaceAlpha(e[4], i.MONTH_NAMES)), e[5].length >= 3 && (e[5] = this.alternativeWeekdays ? this.replaceAlpha(e[5], i.DAY_NAMES_QUARTZ) : this.replaceAlpha(e[5], i.DAY_NAMES)), e[5].startsWith("+") && (this.useAndLogic = true, e[5] = e[5].substring(1), e[5] === "")) throw new TypeError("CronPattern: Day-of-week field cannot be empty after '+' modifier.");
    switch (e[5] == "*" && (this.starDOW = true), this.mode) {
      case "5-part":
        e[0] = "0", e[6] = "*";
        break;
      case "6-part":
        e[6] = "*";
        break;
      case "5-or-6-parts":
        e[6] = "*";
        break;
      case "6-or-7-parts":
        break;
      case "7-part":
      case "auto":
        break;
    }
    this.throwAtIllegalCharacters(e), this.partToArray("second", e[0], 0, 1), this.partToArray("minute", e[1], 0, 1), this.partToArray("hour", e[2], 0, 1), this.partToArray("day", e[3], -1, 1), this.partToArray("month", e[4], -1, 1);
    let n = this.alternativeWeekdays ? -1 : 0;
    this.partToArray("dayOfWeek", e[5], n, 63), this.partToArray("year", e[6], 0, 1), !this.alternativeWeekdays && this.dayOfWeek[7] && (this.dayOfWeek[0] = this.dayOfWeek[7]);
    let s = (r, a) => !r.includes("*") && !r.includes("/") && a.filter((o) => o).length === 1;
    this.isFixedTime = s(e[0], this.second) && s(e[1], this.minute) && s(e[2], this.hour);
  }
  partToArray(e, t, n, s) {
    let r = this[e];
    if (t === "" && !(e === "day" && (this.lastDayOfMonth || this.lastWeekday))) throw new TypeError("CronPattern: configuration entry " + e + " (" + t + ") is empty, check for trailing spaces.");
    if (t === "*") return r.fill(s);
    let a = t.split(",");
    if (a.length > 1) for (let o of a) this.partToArray(e, o, n, s);
    else t.includes("-") && t.includes("/") ? this.handleRangeWithStepping(t, e, n, s) : t.includes("-") ? this.handleRange(t, e, n, s) : t.includes("/") ? this.handleStepping(t, e, n, s) : t !== "" && this.handleNumber(t, e, n, s);
  }
  throwAtIllegalCharacters(e) {
    for (let t = 0; t < e.length; t++) if ((t === 3 ? /[^/*0-9,\-WwLl]+/ : t === 5 ? /[^/*0-9,\-#Ll]+/ : /[^/*0-9,\-]+/).test(e[t])) throw new TypeError("CronPattern: configuration entry " + t + " (" + e[t] + ") contains illegal characters.");
  }
  handleNumber(e, t, n, s) {
    let r = this.extractNth(e, t), a = e.toUpperCase().includes("W");
    if (t !== "day" && a) throw new TypeError("CronPattern: Nearest weekday modifier (W) only allowed in day-of-month.");
    a && (t = "nearestWeekdays");
    let o = parseInt(r[0], 10) + n;
    if (isNaN(o)) throw new TypeError("CronPattern: " + t + " is not a number: '" + e + "'");
    this.setPart(t, o, r[1] || s);
  }
  setPart(e, t, n) {
    if (!Object.prototype.hasOwnProperty.call(this, e)) throw new TypeError("CronPattern: Invalid part specified: " + e);
    if (e === "dayOfWeek") {
      if (t === 7 && (t = 0), t < 0 || t > 6) throw new RangeError("CronPattern: Invalid value for dayOfWeek: " + t);
      this.setNthWeekdayOfMonth(t, n);
      return;
    }
    if (e === "second" || e === "minute") {
      if (t < 0 || t >= 60) throw new RangeError("CronPattern: Invalid value for " + e + ": " + t);
    } else if (e === "hour") {
      if (t < 0 || t >= 24) throw new RangeError("CronPattern: Invalid value for " + e + ": " + t);
    } else if (e === "day" || e === "nearestWeekdays") {
      if (t < 0 || t >= 31) throw new RangeError("CronPattern: Invalid value for " + e + ": " + t);
    } else if (e === "month") {
      if (t < 0 || t >= 12) throw new RangeError("CronPattern: Invalid value for " + e + ": " + t);
    } else if (e === "year" && (t < 1 || t >= 1e4)) throw new RangeError("CronPattern: Invalid value for " + e + ": " + t + " (supported range: 1-9999)");
    this[e][t] = n;
  }
  validateNotNaN(e, t) {
    if (isNaN(e)) throw new TypeError(t);
  }
  validateRange(e, t, n, s, r) {
    if (e > t) throw new TypeError("CronPattern: From value is larger than to value: '" + r + "'");
    if (n !== void 0) {
      if (n === 0) throw new TypeError("CronPattern: Syntax error, illegal stepping: 0");
      if (n > this[s].length) throw new TypeError("CronPattern: Syntax error, steps cannot be greater than maximum value of part (" + this[s].length + ")");
    }
  }
  handleRangeWithStepping(e, t, n, s) {
    if (e.toUpperCase().includes("W")) throw new TypeError("CronPattern: Syntax error, W is not allowed in ranges with stepping.");
    let r = this.extractNth(e, t), a = r[0].match(/^(\d+)-(\d+)\/(\d+)$/);
    if (a === null) throw new TypeError("CronPattern: Syntax error, illegal range with stepping: '" + e + "'");
    let [, o, u, h] = a, c = parseInt(o, 10) + n, d = parseInt(u, 10) + n, m = parseInt(h, 10);
    this.validateNotNaN(c, "CronPattern: Syntax error, illegal lower range (NaN)"), this.validateNotNaN(d, "CronPattern: Syntax error, illegal upper range (NaN)"), this.validateNotNaN(m, "CronPattern: Syntax error, illegal stepping: (NaN)"), this.validateRange(c, d, m, t, e);
    for (let p = c; p <= d; p += m) this.setPart(t, p, r[1] || s);
  }
  extractNth(e, t) {
    let n = e, s;
    if (n.includes("#")) {
      if (t !== "dayOfWeek") throw new Error("CronPattern: nth (#) only allowed in day-of-week field");
      s = n.split("#")[1], n = n.split("#")[0];
    } else if (n.toUpperCase().endsWith("L")) {
      if (t !== "dayOfWeek") throw new Error("CronPattern: L modifier only allowed in day-of-week field (use L alone for day-of-month)");
      s = "L", n = n.slice(0, -1);
    }
    return [n, s];
  }
  handleRange(e, t, n, s) {
    if (e.toUpperCase().includes("W")) throw new TypeError("CronPattern: Syntax error, W is not allowed in a range.");
    let r = this.extractNth(e, t), a = r[0].split("-");
    if (a.length !== 2) throw new TypeError("CronPattern: Syntax error, illegal range: '" + e + "'");
    let o = parseInt(a[0], 10) + n, u = parseInt(a[1], 10) + n;
    this.validateNotNaN(o, "CronPattern: Syntax error, illegal lower range (NaN)"), this.validateNotNaN(u, "CronPattern: Syntax error, illegal upper range (NaN)"), this.validateRange(o, u, void 0, t, e);
    for (let h = o; h <= u; h++) this.setPart(t, h, r[1] || s);
  }
  handleStepping(e, t, n, s) {
    if (e.toUpperCase().includes("W")) throw new TypeError("CronPattern: Syntax error, W is not allowed in parts with stepping.");
    let r = this.extractNth(e, t), a = r[0].split("/");
    if (a.length !== 2) throw new TypeError("CronPattern: Syntax error, illegal stepping: '" + e + "'");
    if (this.sloppyRanges) a[0] === "" && (a[0] = "*");
    else {
      if (a[0] === "") throw new TypeError("CronPattern: Syntax error, stepping with missing prefix ('" + e + "') is not allowed. Use wildcard (*/step) or range (min-max/step) instead.");
      if (a[0] !== "*") throw new TypeError("CronPattern: Syntax error, stepping with numeric prefix ('" + e + "') is not allowed. Use wildcard (*/step) or range (min-max/step) instead.");
    }
    let o = 0;
    a[0] !== "*" && (o = parseInt(a[0], 10) + n);
    let u = parseInt(a[1], 10);
    this.validateNotNaN(u, "CronPattern: Syntax error, illegal stepping: (NaN)"), this.validateRange(0, this[t].length - 1, u, t, e);
    for (let h = o; h < this[t].length; h += u) t === "year" && h === 0 || this.setPart(t, h, r[1] || s);
  }
  replaceAlpha(e, t) {
    let n = e;
    for (let [s, r] of Object.entries(t)) n = n.replace(new RegExp(s, "gi"), r);
    return n;
  }
  static DAY_NAMES = { "-sun": "-7", sun: "0", mon: "1", tue: "2", wed: "3", thu: "4", fri: "5", sat: "6" };
  static DAY_NAMES_QUARTZ = { sun: "1", mon: "2", tue: "3", wed: "4", thu: "5", fri: "6", sat: "7" };
  static MONTH_NAMES = { jan: "1", feb: "2", mar: "3", apr: "4", may: "5", jun: "6", jul: "7", aug: "8", sep: "9", oct: "10", nov: "11", dec: "12" };
  static NICKNAME_MAP = { "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *" };
  handleNicknames(e) {
    let t = e.trim().toLowerCase();
    if (t === "@reboot") throw new TypeError("CronPattern: @reboot is not supported in this environment. This is an event-based trigger that requires system startup detection.");
    return i.NICKNAME_MAP[t] || e;
  }
  setNthWeekdayOfMonth(e, t) {
    if (typeof t != "number" && t.toUpperCase() === "L") this.dayOfWeek[e] = this.dayOfWeek[e] | 32;
    else if (t === 63) this.dayOfWeek[e] = 63;
    else if (t < 6 && t > 0) this.dayOfWeek[e] = this.dayOfWeek[e] | R[t - 1];
    else throw new TypeError(`CronPattern: nth weekday out of range, should be 1-5 or L. Value: ${t}, Type: ${typeof t}`);
  }
};
var $ = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var l = [["month", "year", 0], ["day", "month", -1], ["hour", "day", 0], ["minute", "hour", 0], ["second", "minute", 0]];
var f = class i2 {
  tz;
  instantMs;
  instantFields;
  ms;
  second;
  minute;
  hour;
  day;
  month;
  year;
  constructor(e, t) {
    if (this.tz = t, e && e instanceof Date) if (!isNaN(e)) this.fromDate(e);
    else throw new TypeError("CronDate: Invalid date passed to CronDate constructor");
    else if (e == null) this.fromDate(/* @__PURE__ */ new Date());
    else if (e && typeof e == "string") this.fromString(e);
    else if (e instanceof i2) this.fromCronDate(e);
    else throw new TypeError("CronDate: Invalid type (" + typeof e + ") passed to CronDate constructor");
  }
  getLastDayOfMonth(e, t) {
    return t !== 1 ? $[t] : new Date(Date.UTC(e, t + 1, 0)).getUTCDate();
  }
  getLastWeekday(e, t) {
    let n = this.getLastDayOfMonth(e, t), r = new Date(Date.UTC(e, t, n)).getUTCDay();
    return r === 0 ? n - 2 : r === 6 ? n - 1 : n;
  }
  getNearestWeekday(e, t, n) {
    let s = this.getLastDayOfMonth(e, t);
    if (n > s) return -1;
    let a = new Date(Date.UTC(e, t, n)).getUTCDay();
    return a === 0 ? n === s ? n - 2 : n + 1 : a === 6 ? n === 1 ? n + 2 : n - 1 : n;
  }
  isNthWeekdayOfMonth(e, t, n, s) {
    let a = new Date(Date.UTC(e, t, n)).getUTCDay(), o = 0;
    for (let u = 1; u <= n; u++) new Date(Date.UTC(e, t, u)).getUTCDay() === a && o++;
    if (s & 63 && R[o - 1] & s) return true;
    if (s & 32) {
      let u = this.getLastDayOfMonth(e, t);
      for (let h = n + 1; h <= u; h++) if (new Date(Date.UTC(e, t, h)).getUTCDay() === a) return false;
      return true;
    }
    return false;
  }
  fromDate(e) {
    if (this.tz !== void 0) if (typeof this.tz == "number") this.ms = e.getUTCMilliseconds(), this.second = e.getUTCSeconds(), this.minute = e.getUTCMinutes() + this.tz, this.hour = e.getUTCHours(), this.day = e.getUTCDate(), this.month = e.getUTCMonth(), this.year = e.getUTCFullYear(), this.apply();
    else try {
      let t = g(e, this.tz);
      this.ms = e.getMilliseconds(), this.second = t.s, this.minute = t.i, this.hour = t.h, this.day = t.d, this.month = t.m - 1, this.year = t.y, this.cacheInstant(e.getTime() - this.ms);
    } catch (t) {
      let n = t instanceof Error ? t.message : String(t);
      throw new TypeError(`CronDate: Failed to convert date to timezone '${this.tz}'. This may happen with invalid timezone names or dates. Original error: ${n}`);
    }
    else this.ms = e.getMilliseconds(), this.second = e.getSeconds(), this.minute = e.getMinutes(), this.hour = e.getHours(), this.day = e.getDate(), this.month = e.getMonth(), this.year = e.getFullYear(), this.cacheInstant(e.getTime() - this.ms);
  }
  cacheInstant(e) {
    this.instantMs = e;
    let { year: t, month: n, day: s, hour: r, minute: a, second: o } = this;
    this.instantFields = [t, n, s, r, a, o, this.tz];
  }
  cachedInstant() {
    let e = this.instantFields;
    if (!(e === void 0 || e[6] !== this.tz) && !(e[5] !== this.second || e[4] !== this.minute || e[3] !== this.hour) && !(e[2] !== this.day || e[1] !== this.month || e[0] !== this.year)) return this.instantMs;
  }
  fromCronDate(e) {
    this.tz = e.tz, this.year = e.year, this.month = e.month, this.day = e.day, this.hour = e.hour, this.minute = e.minute, this.second = e.second, this.ms = e.ms, this.instantMs = e.instantMs, this.instantFields = e.instantFields;
  }
  apply() {
    if (this.month > 11 || this.month < 0 || this.day > this.getLastDayOfMonth(this.year, this.month) || this.day < 1 || this.hour > 23 || this.minute > 59 || this.second > 59 || this.hour < 0 || this.minute < 0 || this.second < 0) {
      let e = /* @__PURE__ */ new Date(0);
      return e.setUTCFullYear(this.year, this.month, this.day), e.setUTCHours(this.hour, this.minute, this.second, this.ms), this.ms = e.getUTCMilliseconds(), this.second = e.getUTCSeconds(), this.minute = e.getUTCMinutes(), this.hour = e.getUTCHours(), this.day = e.getUTCDate(), this.month = e.getUTCMonth(), this.year = e.getUTCFullYear(), true;
    } else return false;
  }
  fromString(e) {
    if (typeof this.tz == "number") {
      if (O(e)) return this.fromDate(D(e));
      let t = D(e, "Etc/UTC");
      this.ms = t.getUTCMilliseconds(), this.second = t.getUTCSeconds(), this.minute = t.getUTCMinutes(), this.hour = t.getUTCHours(), this.day = t.getUTCDate(), this.month = t.getUTCMonth(), this.year = t.getUTCFullYear(), this.apply();
    } else return this.fromDate(D(e, this.tz));
  }
  findNext(e, t, n, s) {
    return this._findMatch(e, t, n, s, 1);
  }
  _matchDayValue(e, t, n, s) {
    let r = e;
    if (!r) {
      for (let a = 0; a < n.nearestWeekdays.length; a++) if (n.nearestWeekdays[a]) {
        let o = this.getNearestWeekday(this.year, this.month, a + 1);
        if (o !== -1 && o === t) {
          r = 1;
          break;
        }
      }
    }
    if (n.lastWeekday) {
      let a = this.getLastWeekday(this.year, this.month);
      t === a && (r = 1);
    }
    if (n.lastDayOfMonth) {
      let a = this.getLastDayOfMonth(this.year, this.month);
      t === a && (r = 1);
    }
    if (!n.starDOW) {
      let a = new Date(Date.UTC(this.year, this.month, 1, 0, 0, 0, 0)).getUTCDay(), o = n.dayOfWeek[(a + (t - 1)) % 7];
      o && o & 63 && (o = this.isNthWeekdayOfMonth(this.year, this.month, t, o) ? 1 : 0), n.useAndLogic ? r = r && o : !s.domAndDow && !n.starDOM ? r = r || o : r = r && o;
    }
    return r;
  }
  _findMatch(e, t, n, s, r) {
    let a = this[t], o = this[t] + s, u = r === 1 ? (h) => h < n[t].length : (h) => h >= 0;
    for (let h = o; u(h); h += r) {
      let c = n[t][h];
      if (t === "day" && (c = this._matchDayValue(c, h - s, n, e)), c) return this[t] = h - s, a !== this[t] ? 2 : 1;
    }
    return 3;
  }
  recurse(e, t, n) {
    let s = this.year, r = n;
    for (; typeof r == "number"; ) {
      if (e.starYear && Math.abs(this.year - s) > 400) return null;
      r = this.recurseStep(e, t, r);
    }
    return r;
  }
  recurseStep(e, t, n) {
    if (n === 0 && !e.starYear) {
      if (this.year >= 0 && this.year < e.year.length && e.year[this.year] === 0) {
        let r = -1;
        for (let a = this.year + 1; a < e.year.length && a < 1e4; a++) if (e.year[a] === 1) {
          r = a;
          break;
        }
        if (r === -1) return null;
        this.year = r, this.month = 0, this.day = 1, this.hour = 0, this.minute = 0, this.second = 0, this.ms = 0;
      }
      if (this.year >= 1e4) return null;
    }
    let s = this.findNext(t, l[n][0], e, l[n][2]);
    if (s > 1) {
      let r = n + 1;
      for (; r < l.length; ) this[l[r][0]] = -l[r][2], r++;
      if (s === 3) {
        if (this[l[n][1]]++, this[l[n][0]] = -l[n][2], this.apply(), n === 0 && !e.starYear) {
          for (; this.year >= 0 && this.year < e.year.length && e.year[this.year] === 0 && this.year < 1e4; ) this.year++;
          if (this.year >= 1e4 || this.year >= e.year.length) return null;
        }
        return 0;
      } else if (this.apply()) return n - 1;
    }
    return n += 1, n >= l.length ? this : (e.starYear ? this.year >= 3e3 : this.year >= 1e4) ? null : n;
  }
  increment(e, t, n) {
    return this.instantMs = void 0, this.instantFields = void 0, this.second += t.interval !== void 0 && t.interval > 1 && n ? t.interval : 1, this.ms = 0, this.apply(), this.recurse(e, t, 0);
  }
  decrement(e, t) {
    return this.instantMs = void 0, this.instantFields = void 0, this.second -= t.interval !== void 0 && t.interval > 1 ? t.interval : 1, this.ms = 0, this.apply(), this.recurseBackward(e, t, 0);
  }
  recurseBackward(e, t, n) {
    let s = this.year, r = n;
    for (; typeof r == "number"; ) {
      if (e.starYear && Math.abs(this.year - s) > 400) return null;
      r = this.recurseBackwardStep(e, t, r);
    }
    return r;
  }
  recurseBackwardStep(e, t, n) {
    if (n === 0 && !e.starYear) {
      if (this.year >= 0 && this.year < e.year.length && e.year[this.year] === 0) {
        let r = -1;
        for (let a = this.year - 1; a >= 0; a--) if (e.year[a] === 1) {
          r = a;
          break;
        }
        if (r === -1) return null;
        this.year = r, this.month = 11, this.day = 31, this.hour = 23, this.minute = 59, this.second = 59, this.ms = 0;
      }
      if (this.year < 0) return null;
    }
    let s = this.findPrevious(t, l[n][0], e, l[n][2]);
    if (s > 1) {
      let r = n + 1;
      for (; r < l.length; ) {
        let a = l[r][0], o = l[r][2], u = this.getMaxPatternValue(a, e, o);
        this[a] = u, r++;
      }
      if (s === 3) {
        if (this[l[n][1]]--, n === 0) {
          let u = this.getLastDayOfMonth(this.year, this.month);
          this.day > u && (this.day = u);
        }
        if (n === 1) if (this.day <= 0) this.day = 1;
        else {
          let u = this.year, h = this.month;
          for (; h < 0; ) h += 12, u--;
          for (; h > 11; ) h -= 12, u++;
          let c = this.getLastDayOfMonth(u, h);
          this.day > c && (this.day = c);
        }
        this.apply();
        let a = l[n][0], o = l[n][2];
        if (this[a] = this.getMaxPatternValue(a, e, o), this.apply(), n === 0) {
          let u = l[1][2], h = this.getMaxPatternValue("day", e, u);
          h !== this.day && (this.day = h, this.hour = this.getMaxPatternValue("hour", e, l[2][2]), this.minute = this.getMaxPatternValue("minute", e, l[3][2]), this.second = this.getMaxPatternValue("second", e, l[4][2]));
        }
        if (n === 0 && !e.starYear) {
          for (; this.year >= 0 && this.year < e.year.length && e.year[this.year] === 0; ) this.year--;
          if (this.year < 0) return null;
        }
        return 0;
      } else if (this.apply()) return n - 1;
    }
    return n += 1, n >= l.length ? this : this.year < 0 ? null : n;
  }
  getMaxPatternValue(e, t, n) {
    let s = t[e].length - 1 - n;
    for (let r = t[e].length - 1; r >= 0; r--) if (t[e][r]) {
      s = r - n;
      break;
    }
    if (e === "day") {
      let r = this.getLastDayOfMonth(this.year, this.month);
      return t.lastDayOfMonth || !t.starDOW ? r : Math.min(s, r);
    }
    return s;
  }
  findPrevious(e, t, n, s) {
    return this._findMatch(e, t, n, s, -1);
  }
  getDate(e) {
    if (!e && typeof this.tz != "number") {
      let t = this.cachedInstant();
      if (t !== void 0) return new Date(t + (this.tz === void 0 ? this.ms : 0));
    }
    return e || this.tz === void 0 ? new Date(this.year, this.month, this.day, this.hour, this.minute, this.second, this.ms) : typeof this.tz == "number" ? new Date(Date.UTC(this.year, this.month, this.day, this.hour, this.minute - this.tz, this.second, this.ms)) : P(y(this.year, this.month + 1, this.day, this.hour, this.minute, this.second, this.tz), false);
  }
  getTime() {
    return this.getDate(false).getTime();
  }
  match(e, t) {
    if (!e.starYear && (this.year < 0 || this.year >= e.year.length || e.year[this.year] === 0)) return false;
    for (let n = 0; n < l.length; n++) {
      let s = l[n][0], r = l[n][2], a = this[s];
      if (a + r < 0 || a + r >= e[s].length) return false;
      let o = e[s][a + r];
      if (s === "day" && (o = this._matchDayValue(o, a, e, t)), !o) return false;
    }
    return true;
  }
};
function I(i3) {
  i3 === void 0 && (i3 = {}), delete i3.name, i3.legacyMode !== void 0 && i3.domAndDow === void 0 ? i3.domAndDow = !i3.legacyMode : i3.domAndDow === void 0 && (i3.domAndDow = false), i3.legacyMode = !i3.domAndDow;
  let e = (n, s) => n === void 0 ? s : n;
  if (i3.paused = e(i3.paused, false), i3.maxRuns = e(i3.maxRuns, 1 / 0), i3.catch = e(i3.catch, false), i3.unref = e(i3.unref, false), i3.mode = e(i3.mode, "auto"), i3.alternativeWeekdays = e(i3.alternativeWeekdays, false), i3.sloppyRanges = e(i3.sloppyRanges, false), i3.allowPast = e(i3.allowPast, false), i3.interval = i3.interval === void 0 ? 0 : parseInt(i3.interval.toString(), 10), i3.utcOffset = i3.utcOffset === void 0 ? void 0 : parseInt(i3.utcOffset.toString(), 10), i3.dayOffset = i3.dayOffset === void 0 ? 0 : parseInt(i3.dayOffset.toString(), 10), !["auto", "5-part", "6-part", "7-part", "5-or-6-parts", "6-or-7-parts"].includes(i3.mode)) throw new Error("CronOptions: mode must be one of 'auto', '5-part', '6-part', '7-part', '5-or-6-parts', or '6-or-7-parts'.");
  i3.timezone === "" && (i3.timezone = void 0);
  let t = i3.timezone ?? i3.utcOffset;
  if (i3.startAt && (i3.startAt = W(new f(i3.startAt, t))), i3.stopAt && (i3.stopAt = W(new f(i3.stopAt, t))), i3.interval !== null) {
    if (isNaN(i3.interval)) throw new Error("CronOptions: Supplied value for interval is not a number");
    if (i3.interval < 0) throw new Error("CronOptions: Supplied value for interval can not be negative");
  }
  if (i3.utcOffset !== void 0) {
    if (isNaN(i3.utcOffset)) throw new Error("CronOptions: Invalid value passed for utcOffset, should be number representing minutes offset from UTC.");
    if (i3.utcOffset < -870 || i3.utcOffset > 870) throw new Error("CronOptions: utcOffset out of bounds.");
    if (i3.utcOffset !== void 0 && i3.timezone) throw new Error("CronOptions: Combining 'utcOffset' with 'timezone' is not allowed.");
  }
  if (i3.unref !== true && i3.unref !== false) throw new Error("CronOptions: Unref should be either true, false or undefined(false).");
  if (i3.dayOffset !== void 0 && i3.dayOffset !== 0 && isNaN(i3.dayOffset)) throw new Error("CronOptions: Invalid value passed for dayOffset, should be a number representing days to offset.");
  return i3;
}
function W(i3) {
  return i3.ms ? (i3.ms = 0, new f(new Date(i3.getTime() + 1e3), i3.tz)) : i3;
}
function T(i3) {
  return typeof i3 == "function";
}
function z(i3) {
  return T(i3);
}
function F(i3) {
  typeof Deno < "u" && typeof Deno.unrefTimer < "u" ? Deno.unrefTimer(i3) : i3 && typeof i3.unref < "u" && i3.unref();
}
var N = 1440 * 60 * 1e3;
var L = 30 * 1e3;
var k = [];
var Y = class {
  name;
  options;
  _states;
  fn;
  _startAtRoundingMs = 0;
  getTz() {
    return this.options.timezone ?? this.options.utcOffset;
  }
  applyDayOffset(e) {
    let t = this._offsetMs();
    return t ? new Date(e.getTime() + t) : e;
  }
  _offsetMs() {
    return (this.options.dayOffset ?? 0) * N;
  }
  get _startAt() {
    return this.options.startAt;
  }
  get _stopAt() {
    return this.options.stopAt;
  }
  _nextTarget(e, t) {
    let n = this._offsetMs(), s = this._next(this._shift(e), new Date(t.getTime() - n), { startAt: this._shift(this._startAt), stopAt: this._shift(this._stopAt) });
    return s ? this.applyDayOffset(s.getDate(false)) : null;
  }
  _previousTarget(e, t) {
    let n = this._previous(this._shift(e ?? t), { startAt: this._shift(this._startAt), stopAt: this._shift(this._stopAt) });
    return n ? this.applyDayOffset(n.getDate(false)) : null;
  }
  _shift(e) {
    if (e != null) return new f(new Date(this._toMs(e) - this._offsetMs()), this.getTz());
  }
  constructor(e, t, n) {
    let s, r;
    if (T(t)) r = t;
    else if (typeof t == "object") s = t;
    else if (t !== void 0) throw new Error("Cron: Invalid argument passed for optionsIn. Should be one of function, or object (options).");
    if (T(n)) r = n;
    else if (typeof n == "object") s = n;
    else if (n !== void 0) throw new Error("Cron: Invalid argument passed for funcIn. Should be one of function, or object (options).");
    this.name = s?.name;
    let a = s?.startAt;
    if (this.options = I(s), a && this._startAt && (this._startAtRoundingMs = this._startAt.getTime() - new f(a, this.getTz()).getTime()), this._states = { kill: false, blocking: false, previousRun: void 0, currentRun: void 0, once: void 0, currentTimeout: void 0, maxRuns: s ? s.maxRuns : void 0, paused: s ? s.paused : false, pattern: new b("* * * * *", void 0, { mode: "auto" }) }, e && (e instanceof Date || typeof e == "string" && e.indexOf(":") > 0) ? this._states.once = new f(e, this.getTz()) : this._states.pattern = new b(e, this.options.timezone, { mode: this.options.mode, alternativeWeekdays: this.options.alternativeWeekdays, sloppyRanges: this.options.sloppyRanges }), this.name) {
      if (k.find((u) => u.name === this.name)) throw new Error("Cron: Tried to initialize new named job '" + this.name + "', but name already taken.");
      k.push(this);
    }
    return r !== void 0 && z(r) && (this.fn = r, this.schedule()), this;
  }
  nextRun(e) {
    return this._nextTarget(e, /* @__PURE__ */ new Date());
  }
  nextRuns(e, t) {
    this._states.maxRuns !== void 0 && e > this._states.maxRuns && (e = this._states.maxRuns);
    let n = t || this._states.currentRun || void 0;
    return this._enumerateRuns(e, n, "next");
  }
  previousRuns(e, t) {
    return this._enumerateRuns(e, t || void 0, "previous");
  }
  enumerate(e) {
    return new A(this, e);
  }
  _enumerateRuns(e, t, n) {
    let s = [], r = /* @__PURE__ */ new Date(), a = t;
    for (; e-- > 0; ) {
      let o = n === "next" ? this._nextTarget(a, r) : this._previousTarget(a, r);
      if (!o) break;
      s.push(o), a = o;
    }
    return s;
  }
  match(e) {
    if (this._states.once) {
      let n = new f(e, this.getTz());
      n.ms = 0;
      let s = new f(this._states.once, this.getTz());
      return s.ms = 0, n.getTime() === s.getTime();
    }
    let t = new f(e, this.getTz());
    return t.ms = 0, t.match(this._states.pattern, this.options);
  }
  getPattern() {
    if (!this._states.once) return this._states.pattern ? this._states.pattern.pattern : void 0;
  }
  getOnce() {
    return this._states.once ? this._states.once.getDate() : null;
  }
  isRunning() {
    return !this._states.paused && !this._states.kill && this.fn !== void 0 && this._nextTarget(this._states.currentRun, /* @__PURE__ */ new Date()) !== null;
  }
  isStopped() {
    return this._states.kill;
  }
  isBusy() {
    return this._states.blocking;
  }
  currentRun() {
    return this._states.currentRun ? this._states.currentRun.getDate() : null;
  }
  previousRun() {
    return this._states.previousRun ? this._states.previousRun.getDate() : null;
  }
  msToNext(e) {
    let t = /* @__PURE__ */ new Date(), n = this._nextTarget(e, t);
    return n ? n.getTime() - this._toMs(e ?? t) : null;
  }
  stop() {
    this._states.kill = true, this._states.currentTimeout && clearTimeout(this._states.currentTimeout);
    let e = k.indexOf(this);
    e >= 0 && k.splice(e, 1);
  }
  pause() {
    return this._states.paused = true, !this._states.kill;
  }
  resume() {
    return this._states.paused = false, !this._states.kill;
  }
  schedule(e) {
    return this._schedule(e);
  }
  _schedule(e, t) {
    if (e && this.fn) throw new Error("Cron: It is not allowed to schedule two functions using the same Croner instance.");
    e && (this.fn = e);
    let n = t ?? /* @__PURE__ */ new Date(), s = this._nextTarget(void 0, n), r = s ? s.getTime() - n.getTime() : null, a = this._states.currentRun;
    a && a.getTime() > n.getTime() && (a = void 0);
    let o = this._nextTarget(a, n);
    return r === null || isNaN(r) || o === null ? this : (r > L && (r = L), r < 0 && (r = this._states.paused ? 1e3 : 0), this._states.currentTimeout = setTimeout(() => this._checkTrigger(o), r), this._states.currentTimeout && this.options.unref && F(this._states.currentTimeout), this);
  }
  async _trigger(e = /* @__PURE__ */ new Date()) {
    this._states.blocking = true, this._states.currentRun = new f(e, this.getTz());
    try {
      if (this.options.catch) try {
        this.fn !== void 0 && await this.fn(this, this.options.context);
      } catch (t) {
        if (T(this.options.catch)) try {
          this.options.catch(t, this);
        } catch {
        }
      }
      else this.fn !== void 0 && await this.fn(this, this.options.context);
    } finally {
      this._states.previousRun = new f(e, this.getTz()), this._states.blocking = false;
    }
  }
  async trigger() {
    await this._trigger();
  }
  runsLeft() {
    return this._states.maxRuns;
  }
  _checkTrigger(e) {
    let t = /* @__PURE__ */ new Date(), n = !this._states.paused && t.getTime() >= e.getTime(), s = this._states.blocking && this.options.protect;
    n && !s ? (this._states.maxRuns !== void 0 && this._states.maxRuns--, this._trigger(t)) : n && s && T(this.options.protect) && setTimeout(() => this.options.protect(this), 0), this._schedule(void 0, n ? void 0 : t);
  }
  _next(e, t, n) {
    let s = n ? n.startAt : this._startAt, r = n ? n.stopAt : this._stopAt, a = !!e, o = !!(e || this._states.currentRun), u = false;
    !e && s && this.options.interval && (e = this._calculatePreviousRun(s, t), e && (o = true), u = !e);
    let h = e ?? t ?? /* @__PURE__ */ new Date(), c = this._toMs(h);
    e = new f(h, this.getTz()), s && c < s.getTime() && (e = u ? s : new f(new Date(s.getTime() - 1e3), this.getTz()), c = e.getTime());
    let d = this._states.once || new f(e, this.getTz());
    if (!u && d !== this._states.once && (d = this._findOccurrence(e, c, 1, o)), this._states.once) {
      let m = this._states.once.getTime(), p = c - m;
      if (s && m < s.getTime() - this._startAtRoundingMs || this._states.currentRun && this.applyDayOffset(this._states.once.getDate()).getTime() <= this._states.currentRun.getTime() || (a ? p >= 0 : p > 1e3 && !this.options.allowPast)) return null;
    }
    return d === null || this._states.maxRuns !== void 0 && this._states.maxRuns <= 0 || this._states.kill || r && d.getTime() >= r.getTime() ? null : d;
  }
  _previous(e, t) {
    let n = this._toMs(e ?? /* @__PURE__ */ new Date());
    if (t.stopAt && n > t.stopAt.getTime() && (n = t.stopAt.getTime()), this._states.once) return this._states.once.getTime() < n ? this._states.once : null;
    let s = this._findOccurrence(new f(new Date(n), this.getTz()), n, -1);
    return s === null || t.startAt && s.getTime() < t.startAt.getTime() ? null : s;
  }
  _toMs(e) {
    return e instanceof Date ? e.getTime() : new f(e, this.getTz()).getTime();
  }
  _findOccurrence(e, t, n, s = false) {
    let r = this._walk(e, t, n, s), a = this.getTz();
    if (this._states.pattern.isFixedTime && n === 1 || typeof a == "number" || U(t, a) !== (n === 1 ? "earlier" : "later")) return r;
    let o = Math.floor(t / 1e3) * 1e3, u = n === 1 ? _(o, o + N, a) : _(o - N, o, a) - 1e3;
    if (r && (u - r.getTime()) * n > 0) return r;
    let h = this._walk(new f(new Date(u), a), u - n, n, false, true);
    return !r || !h ? r ?? h : (r.getTime() - h.getTime()) * n > 0 ? h : r;
  }
  _walk(e, t, n, s, r = false) {
    let a = this._states.pattern, o = (h, c) => n === 1 ? h.increment(a, this.options, c) : h.decrement(a, this.options), u = new f(e, this.getTz());
    for ((!r || !u.match(a, this.options)) && (u = o(u, s)); u; ) {
      let h = this._runAt(u, t, n);
      if (h) return new f(h, this.getTz());
      u = o(u, false);
    }
    return null;
  }
  _runAt(e, t, n) {
    let s = (m) => (m.getTime() - t) * n > 0, r = e.tz;
    if (typeof r == "number") {
      let m = e.getDate();
      return s(m) ? m : null;
    }
    let a = y(e.year, e.month + 1, e.day, e.hour, e.minute, e.second, r), o = v(a), u = this._states.pattern.isFixedTime;
    if (o.kind === "single") return s(o.date) ? o.date : null;
    if (o.kind === "ambiguous") {
      let { earlier: m, later: p } = o;
      return (u ? [m] : n === 1 ? [m, p] : [p, m]).find(s) ?? null;
    }
    if (!u) return null;
    let h = new Date(_(o.before.getTime(), o.after.getTime(), r)), c = g(h, r);
    return c.y === a.y && c.m === a.m && c.d === a.d && s(h) ? h : null;
  }
  _calculatePreviousRun(e, t) {
    let n = new f(t, this.getTz()).getTime();
    if (e.getTime() > n) return;
    let s = this.options.interval * 1e3, r = e;
    for (; r.getTime() + s <= n; ) {
      let a = new f(r, this.getTz()).increment(this._states.pattern, this.options, true);
      if (a === null) break;
      r = a;
    }
    return r;
  }
};
var A = class {
  cron;
  cursor;
  now;
  done;
  initialMaxRuns;
  remainingRuns;
  constructor(e, t) {
    this.cron = e, this.initialMaxRuns = e.runsLeft() ?? 1 / 0, this.reset(t);
  }
  next() {
    if (this.done || this.remainingRuns <= 0) return this.done = true, { value: void 0, done: true };
    let e = this.cron._nextTarget(this.cursor, this.now);
    return e === null ? (this.done = true, { value: void 0, done: true }) : (this.cursor = e, this.remainingRuns--, { value: e, done: false });
  }
  peek() {
    return this.done || this.remainingRuns <= 0 ? null : this.cron._nextTarget(this.cursor, this.now);
  }
  reset(e) {
    this.cursor = e instanceof Date ? new Date(e.getTime()) : e ?? void 0, this.now = /* @__PURE__ */ new Date(), this.done = false, this.remainingRuns = this.initialMaxRuns;
  }
  [Symbol.iterator]() {
    return this;
  }
};

// src/targets.mjs
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
var uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
var text = (v2, name) => {
  if (typeof v2 !== "string" || !v2.trim() || /[\x00-\x08\x0b-\x1f\x7f]/.test(v2)) throw new Error(`Invalid ${name}`);
};
var absolute = (v2, name) => {
  text(v2, name);
  if (!isAbsolute(v2)) throw new Error(`${name} must be absolute`);
};
var shell = /^-?(sh|bash|zsh|fish|dash|ksh|tcsh|csh|nu|pwsh)$/;
var gone = (message) => Object.assign(new Error(message), { receiverGone: true });
async function processStarts(call, pids) {
  if (!pids.length) return /* @__PURE__ */ new Map();
  const { output } = await call(["ps", "-o", "pid=,lstart=", "-p", pids.join(",")], { env: { ...process.env, LC_ALL: "C" } }).catch((error) => ({ output: error.output ?? "" }));
  return new Map(output.split("\n").map((line) => line.trim().match(/^(\d+)\s+(.+)$/)).filter(Boolean).map(([, pid, start]) => [Number(pid), start.trim()]));
}
var liveRecords = (sessions, surface) => sessions.filter((r) => r.surface_id?.toLowerCase() === surface.toLowerCase() && r.stored_pid_exists === true);
var json = (output) => {
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
};
var sleep = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms));
var emptyInput = (left) => /^\s*[❯›>]\s*$/.test(left);
var ready = ({ left, right, busy }) => busy ? { ok: false, reason: "agent is working" } : !emptyInput(left) || right.trim() ? { ok: false, reason: "input line holds unsubmitted text" } : { ok: true };
var working = (text2) => /esc to interrupt/i.test(text2);
var STATUS_ROWS_ABOVE = 3;
var wide = (cp) => cp >= 4352 && cp <= 4447 || cp >= 11904 && cp <= 42191 || cp >= 44032 && cp <= 55203 || cp >= 63744 && cp <= 64255 || cp >= 65072 && cp <= 65103 || cp >= 65280 && cp <= 65376 || cp >= 65504 && cp <= 65510 || cp >= 127744 && cp <= 129791 || cp >= 131072;
async function confirmCleared(read) {
  for (let i3 = 0; i3 < 20; i3++) {
    await sleep(250);
    const state = await read().catch(() => null);
    if (state && emptyInput(state.left) && !state.right.trim()) return true;
  }
  return false;
}
function splitStyled(line, cells) {
  let left = "", right = "", used = 0, faint = false;
  for (const part of line.split(/(\x1b\[[0-9;:]*m)/)) {
    const sgr = part.match(/^\x1b\[([0-9;:]*)m$/);
    if (sgr) {
      const codes = (sgr[1] || "0").split(";");
      for (let i3 = 0; i3 < codes.length; i3++) {
        const code = Number(codes[i3].split(":")[0]);
        if ([38, 48, 58].includes(code) && !codes[i3].includes(":")) {
          i3 += codes[i3 + 1] === "5" ? 2 : codes[i3 + 1] === "2" ? 4 : 0;
          continue;
        }
        if (code === 2) faint = true;
        else if (code === 0 || code === 22) faint = false;
      }
      continue;
    }
    for (const ch of part) {
      if (used < cells) left += ch;
      else if (!faint) right += ch;
      used += wide(ch.codePointAt(0)) ? 2 : 1;
    }
  }
  return { left, right };
}
var terminals = {
  cmux: {
    fields: ["workspace", "surface"],
    optional: ["agent"],
    validate(t) {
      if (![t.surface, t.workspace].every((v2) => typeof v2 === "string" && uuid.test(v2))) throw new Error("cmux requires surface and workspace UUIDs");
    },
    key: (t) => [t.workspace, t.surface],
    async verify(call, t) {
      const listed = await call(["cmux", "--id-format", "uuids", "tree", "--workspace", t.workspace]).catch((error) => error);
      if (listed instanceof Error) throw /not_found/.test(listed.message) ? gone(listed.message) : listed;
      if (!listed.output.toLowerCase().includes(t.surface.toLowerCase())) throw gone("cmux surface is absent from the declared workspace");
      const sessions = json((await call(["cmux", "sessions", "list", "--surface", t.surface, "--json", "--all"])).output)?.sessions ?? [];
      const live = liveRecords(sessions, t.surface);
      if (!live.length) throw gone("No live agent session on the cmux surface");
      if (t.agent) {
        const starts = await processStarts(call, [t.agent.pid]);
        if (!live.some((r) => r.pid === t.agent.pid) || starts.get(t.agent.pid) !== t.agent.startedAt) throw gone("The registered agent process no longer runs on the cmux surface");
      }
    },
    async input(call, t) {
      const grid = json((await call(["cmux", "rpc", "terminal.replay", JSON.stringify({ workspace_id: t.workspace, surface_id: t.surface })], { maxOutput: 16 << 20 })).output)?.render_grid;
      if (!grid?.cursor) throw new Error("cmux render grid unavailable");
      const faint = new Set((grid.styles ?? []).filter((style) => style.faint).map((style) => style.id));
      const row = (grid.row_spans ?? []).filter((span) => span.row === grid.cursor.row).sort((a, b2) => a.column - b2.column);
      return {
        left: row.filter((span) => span.column < grid.cursor.column).map((span) => span.text).join(""),
        right: row.filter((span) => span.column >= grid.cursor.column && !faint.has(span.style_id)).map((span) => span.text).join(""),
        busy: working((grid.row_spans ?? []).filter((span) => span.row >= grid.cursor.row - STATUS_ROWS_ABOVE).map((span) => span.text).join(" "))
      };
    },
    async ready(call, t) {
      return ready(await this.input(call, t));
    },
    async submit(call, t, prompt) {
      await call(["cmux", "rpc", "surface.send_text", JSON.stringify({ workspace_id: t.workspace, surface_id: t.surface, text: prompt })]);
      await sleep(250);
      await call(["cmux", "send-key", "--workspace", t.workspace, "--surface", t.surface, "Enter"]);
      return { confirmed: await confirmCleared(() => this.input(call, t)), proof: "input-line-cleared" };
    },
    fromEnv: async (env) => env.CMUX_WORKSPACE_ID && env.CMUX_SURFACE_ID ? { workspace: env.CMUX_WORKSPACE_ID, surface: env.CMUX_SURFACE_ID } : null,
    async read(call, t) {
      return (await call(["cmux", "read-screen", "--workspace", t.workspace, "--surface", t.surface, "--lines", "40"])).output;
    },
    async list(call) {
      const tree = json((await call(["cmux", "--id-format", "uuids", "tree", "--all", "--json"])).output);
      const sessions = json((await call(["cmux", "sessions", "list", "--json", "--all"]).catch(() => ({ output: "" }))).output)?.sessions ?? [];
      const starts = await processStarts(call, [...new Set(sessions.filter((r) => r.stored_pid_exists === true && Number.isSafeInteger(r.pid)).map((r) => r.pid))]);
      const rows = [];
      for (const w2 of tree?.windows ?? []) for (const ws of w2.workspaces ?? []) for (const pane of ws.panes ?? []) for (const s of pane.surfaces ?? []) {
        if (s.type !== "terminal") continue;
        const session = liveRecords(sessions, s.id).sort((a, b2) => (b2.updated_at_unix ?? 0) - (a.updated_at_unix ?? 0))[0];
        const agent = session && starts.has(session.pid) ? { pid: session.pid, startedAt: starts.get(session.pid) } : null;
        rows.push({ target: { type: "cmux", workspace: ws.id, surface: s.id, ...agent ? { agent } : {} }, label: s.title ?? s.id, group: ws.title ?? ws.id, live: !!session, agent: session?.agent ?? null, session: session?.session_id ?? null, cwd: session?.cwd ?? null });
      }
      return rows;
    }
  },
  orca: {
    fields: ["terminal"],
    validate(t) {
      text(t.terminal, "orca terminal handle");
      if (t.terminal.length > 256) throw new Error("orca terminal handle is too long");
    },
    key: (t) => [t.terminal],
    async verify(call, t) {
      const result = await call(["orca", "terminal", "show", "--terminal", t.terminal, "--json"]).catch((error) => error);
      const shown = json(result.output ?? "");
      if (shown?.ok === false && /stale|not_found|unknown_terminal/.test(shown.error?.code ?? "")) throw gone(`orca terminal is gone (${shown.error.code})`);
      if (result instanceof Error) throw result;
      const terminal = shown?.result?.terminal ?? shown?.result ?? shown;
      if (!terminal?.agentIdentity) throw gone("No running agent in the orca terminal");
    },
    async ready(call, t) {
      const waited = await call(["orca", "terminal", "wait", "--terminal", t.terminal, "--for", "tui-idle", "--timeout-ms", "2000", "--json"]).catch((error) => error);
      return waited instanceof Error ? { ok: false, reason: `agent is not idle (${waited.message})` } : { ok: true };
    },
    async submit(call, t, prompt) {
      const sent = json((await call(["orca", "terminal", "send", "--terminal", t.terminal, "--text", prompt, "--enter", "--wait-submit", "10", "--json"])).output);
      if (sent?.ok === false) throw new Error(`orca send failed (${sent.error?.code ?? "unknown"})`);
      const stages = /* @__PURE__ */ new Set();
      const collect = (value) => {
        if (Array.isArray(value)) value.forEach(collect);
        else if (value && typeof value === "object") for (const [key, v2] of Object.entries(value)) {
          if (/stage/i.test(key)) [v2].flat().forEach((x2) => typeof x2 === "string" ? stages.add(x2) : collect(x2));
          else collect(v2);
        }
      };
      collect(sent?.result ?? sent);
      const proof = ["turn_started", "submitted", "submission_observed"].find((stage) => stages.has(stage));
      return { confirmed: !!proof, proof: proof && `orca-${proof.replace(/_/g, "-")}` };
    },
    async fromEnv(env, call) {
      if (!env.ORCA_PANE_KEY) return null;
      const listed = json((await call(["orca", "terminal", "list", "--json"])).output);
      const row = (listed?.result?.terminals ?? listed?.terminals ?? []).find((r) => `${r.tabId}:${r.leafId}` === env.ORCA_PANE_KEY);
      return row?.handle ? { terminal: row.handle } : null;
    },
    async read(call, t) {
      const read = json((await call(["orca", "terminal", "read", "--terminal", t.terminal, "--screen", "--json"])).output);
      if (read?.ok === false) throw new Error(read.error?.message ?? "orca terminal read failed");
      const result = read?.result ?? read;
      return typeof result === "string" ? result : result?.screen ?? result?.text ?? JSON.stringify(result, null, 2);
    },
    async list(call) {
      const listed = json((await call(["orca", "terminal", "list", "--json"])).output);
      if (listed?.ok === false) throw new Error(listed.error?.message ?? "orca terminal list failed");
      const rows = listed?.result?.terminals ?? listed?.terminals ?? [];
      return rows.filter((r) => typeof r.handle === "string").map((r) => ({ target: { type: "orca", terminal: r.handle }, label: r.paneTitle || r.title || r.handle, group: r.worktreePath ?? r.worktree ?? null, live: !!r.agentIdentity, agent: r.agentIdentity ?? null, session: null, cwd: r.cwd ?? r.worktreePath ?? null }));
    }
  },
  tmux: {
    fields: ["socket", "pane"],
    validate(t) {
      if (!/^%\d+$/.test(t.pane)) throw new Error("tmux requires an exact %pane id");
      absolute(t.socket, "tmux socket");
    },
    key: (t) => [t.socket, t.pane],
    async verify(call, t) {
      const listed = await call(["tmux", "-S", t.socket, "display-message", "-p", "-t", t.pane, "#{pane_id}	#{pane_current_command}"]).catch((error) => error);
      if (listed instanceof Error) throw /can't find pane|no server running|error connecting/i.test(listed.message) ? gone(listed.message) : listed;
      const [pane, command2] = listed.output.trim().split("	");
      if (pane !== t.pane) throw gone("tmux pane identity mismatch");
      if (shell.test(command2 ?? "")) throw gone("No running agent in the tmux pane");
    },
    async input(call, t) {
      const [x2, y2, mode] = (await call(["tmux", "-S", t.socket, "display-message", "-p", "-t", t.pane, "#{cursor_x}	#{cursor_y}	#{pane_in_mode}"])).output.trim().split("	").map(Number);
      if (!Number.isInteger(x2) || !Number.isInteger(y2)) throw new Error("tmux cursor unavailable");
      if (mode) return { left: "", right: "", busy: true };
      const screen = (await call(["tmux", "-S", t.socket, "capture-pane", "-p", "-e", "-t", t.pane])).output.split("\n");
      return { ...splitStyled(screen[y2] ?? "", x2), busy: working(screen.slice(Math.max(0, y2 - STATUS_ROWS_ABOVE)).join("\n").replace(/\x1b\[[0-9;:]*m/g, "")) };
    },
    async ready(call, t) {
      return ready(await this.input(call, t));
    },
    async submit(call, t, prompt) {
      await call(["tmux", "-S", t.socket, "send-keys", "-t", t.pane, "-l", "--", prompt]);
      await sleep(250);
      await call(["tmux", "-S", t.socket, "send-keys", "-t", t.pane, "Enter"]);
      return { confirmed: await confirmCleared(() => this.input(call, t)), proof: "input-line-cleared" };
    },
    fromEnv: async (env) => env.TMUX && env.TMUX_PANE ? { socket: env.TMUX.split(",")[0], pane: env.TMUX_PANE } : null,
    async read(call, t) {
      return (await call(["tmux", "-S", t.socket, "capture-pane", "-p", "-t", t.pane, "-S", "-40"])).output;
    },
    async list(call) {
      const { output } = await call(["tmux", "list-panes", "-a", "-F", "#{socket_path}	#{pane_id}	#{session_name}:#{window_index}.#{pane_index}	#{pane_current_command}	#{pane_current_path}"]);
      return output.split("\n").filter(Boolean).map((line) => {
        const [socket, pane, name, command2, cwd] = line.split("	");
        return { target: { type: "tmux", socket, pane }, label: `${name} ${command2}`, group: socket, live: !shell.test(command2), agent: null, session: null, cwd };
      });
    }
  }
};
function validateTarget(target) {
  if (!target || typeof target !== "object" || Array.isArray(target)) throw new Error("target must be an object");
  if (target.type === "codex-queue") throw new Error("codex-queue was removed; target the agent through its terminal (cmux, orca, or tmux)");
  const manager = terminals[target.type];
  const allowed = target.type === "command" ? ["type", "argv", "cwd"] : manager && ["type", ...manager.fields, ...manager.optional ?? [], "mode", "prompt"];
  if (!allowed || Object.keys(target).some((k2) => !allowed.includes(k2))) throw new Error("Unknown target type or field");
  if (target.type === "command") {
    if (!Array.isArray(target.argv) || !target.argv.length) throw new Error("command.argv must be nonempty");
    target.argv.forEach((v2) => text(v2, "argument"));
    absolute(target.cwd, "cwd");
    return target;
  }
  text(target.prompt, "prompt");
  if (target.prompt.includes("	")) throw new Error("Tab control input is not allowed in prompts");
  if (target.prompt.length > 16e3) throw new Error("prompt exceeds 16000 characters");
  if (target.mode !== void 0 && !["prompt", "goal"].includes(target.mode)) throw new Error("mode must be prompt or goal");
  if (target.agent !== void 0) {
    const a = target.agent;
    if (!a || typeof a !== "object" || Object.keys(a).some((k2) => !["pid", "startedAt"].includes(k2)) || !Number.isSafeInteger(a.pid) || a.pid < 1) throw new Error("agent requires pid and startedAt");
    text(a.startedAt, "agent startedAt");
  }
  manager.validate(target);
  return target;
}
function targetKey(t) {
  const key = t.type === "command" ? [t.type, t.argv, t.cwd] : [t.type, ...terminals[t.type].key(t)];
  return createHash("sha256").update(JSON.stringify(key)).digest("hex");
}
function processCommand(argv, { cwd, env = process.env, timeoutMs = 3e4, signal, maxOutput = 65536 } = {}) {
  return new Promise((resolve2, reject) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    let output = "", timedOut = false, aborted = false;
    const stop = () => {
      try {
        process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGTERM");
      } catch {
      }
      force = setTimeout(() => {
        try {
          process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL");
        } catch {
        }
      }, 1e3);
    };
    let force;
    const abort = () => {
      aborted = true;
      stop();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => {
      output = (output + chunk).slice(-maxOutput);
    });
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(force);
      signal?.removeEventListener("abort", abort);
    };
    child.on("error", (error) => {
      cleanup();
      reject(error);
    });
    child.on("close", (code, sig) => {
      if ((timedOut || aborted) && child.pid) {
        try {
          process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL");
        } catch {
        }
      }
      cleanup();
      resolve2({ code, signal: sig, output, timedOut, aborted });
    });
  });
}
var caller = (options = {}) => {
  const execute = options.execute ?? processCommand;
  return async (argv, extra = {}) => {
    if (options.signal?.aborted) throw new Error("Dispatch aborted");
    const result = await execute(argv, { ...options, ...extra });
    if (result.code !== 0 || result.timedOut || result.aborted) {
      const detail = json(result.output ?? "")?.error?.message ?? result.output?.trim().split("\n").at(-1);
      throw Object.assign(new Error(`Transport failed (${result.timedOut ? "timeout" : result.aborted ? "aborted" : result.code})${detail ? `: ${detail.slice(0, 300)}` : ""}`), { output: result.output });
    }
    return result;
  };
};
async function dispatch(target, options = {}) {
  validateTarget(target);
  const call = caller(options);
  if (target.type === "command") {
    await call(target.argv, { cwd: target.cwd });
    return { status: "succeeded", acknowledgment: "command-exited-zero" };
  }
  const manager = terminals[target.type];
  try {
    await manager.verify(call, target);
  } catch (error) {
    return { status: "not-delivered", acknowledgment: "receiver-check-failed-before-input", receiverGone: !!error.receiverGone, error: error.message };
  }
  const ready2 = await manager.ready(call, target).catch((error) => ({ ok: false, reason: error.message }));
  if (!ready2.ok) return { status: "not-delivered", acknowledgment: "receiver-not-ready-before-input", receiverGone: false, error: ready2.reason };
  const prompt = target.prompt.replace(/[\r\n]+/g, " ");
  const sent = await manager.submit(call, target, target.mode === "goal" ? `/goal ${prompt}` : prompt);
  if (!sent.confirmed) return { status: "uncertain", acknowledgment: "submission-not-confirmed", error: "Input was typed but submission was not observed; inspect the receiver before resolving" };
  return { status: "transport-accepted", acknowledgment: "submitted-not-model-turn", proof: sent.proof };
}
async function listTerminals(options = {}) {
  const call = caller({ timeoutMs: 1e4, maxOutput: 16 << 20, ...options });
  return Promise.all(Object.entries(terminals).map(async ([type, manager]) => {
    try {
      return { type, available: true, terminals: await manager.list(call) };
    } catch (error) {
      return { type, available: false, error: error.code === "ENOENT" ? `${type} is not installed` : error.message, terminals: [] };
    }
  }));
}
async function readTerminal(target, options = {}) {
  validateTarget({ ...target, prompt: "read" });
  return terminals[target.type].read(caller({ timeoutMs: 1e4, maxOutput: 1 << 20, ...options }), target);
}
async function currentReceivers(env = process.env, options = {}) {
  const call = caller({ timeoutMs: 5e3, maxOutput: 16 << 20, ...options });
  const found = [];
  for (const [type, manager] of Object.entries(terminals)) {
    const ids = await manager.fromEnv(env, call).catch(() => null);
    if (ids) found.push({ type, ...ids });
  }
  return found;
}
var sameReceiver = (a, b2) => a.type === b2.type && a.type !== "command" && terminals[a.type].fields.every((f2) => String(a[f2]).toLowerCase() === String(b2[f2]).toLowerCase());
async function agentForSession(sessionId, options = {}) {
  if (typeof sessionId !== "string" || !sessionId) return null;
  const call = caller({ timeoutMs: 5e3, maxOutput: 1 << 20, ...options });
  const sessions = json((await call(["cmux", "sessions", "list", "--session", sessionId, "--json", "--all"]).catch(() => ({ output: "" }))).output)?.sessions ?? [];
  const record = sessions.find((r) => r.session_id?.toLowerCase() === sessionId.toLowerCase() && Number.isSafeInteger(r.pid));
  if (!record) return null;
  const startedAt = (await processStarts(call, [record.pid])).get(record.pid);
  return startedAt ? { pid: record.pid, startedAt } : null;
}

// src/core.mjs
var idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
var iso = (value) => new Date(value).toISOString();
var alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== "ESRCH";
  }
};
function validate(spec) {
  const fields = ["schemaVersion", "id", "trigger", "target", "maxRuns", "expiresAt", "timeoutMs", "enabled", "cooldownMs"];
  if (!spec || typeof spec !== "object" || Array.isArray(spec) || Object.keys(spec).some((k2) => !fields.includes(k2))) throw new Error("Unknown schedule field");
  if (spec.schemaVersion !== 1 || typeof spec.id !== "string" || !idPattern.test(spec.id)) throw new Error("Expected schemaVersion 1 and a safe id");
  if (typeof spec.enabled !== "boolean") throw new Error("enabled must be boolean");
  if (!Number.isSafeInteger(spec.maxRuns) || spec.maxRuns < 1 || spec.maxRuns > 1e5) throw new Error("maxRuns must be 1..100000");
  if (!Number.isSafeInteger(spec.timeoutMs) || spec.timeoutMs < 100 || spec.timeoutMs > 9e5) throw new Error("timeoutMs must be 100..900000");
  if (spec.cooldownMs !== void 0 && (!Number.isSafeInteger(spec.cooldownMs) || spec.cooldownMs < 0 || spec.cooldownMs > 864e5)) throw new Error("Invalid cooldownMs");
  if (typeof spec.expiresAt !== "string" || !Number.isFinite(Date.parse(spec.expiresAt))) throw new Error("expiresAt must be a timestamp");
  const t = spec.trigger;
  if (!t || Object.keys(t).length !== 1) throw new Error("trigger requires exactly one of at, everyMs, cron");
  if ("at" in t) {
    if (typeof t.at !== "string" || !Number.isFinite(Date.parse(t.at))) throw new Error("Invalid at timestamp");
  } else if ("everyMs" in t) {
    if (!Number.isSafeInteger(t.everyMs) || t.everyMs < 1e3) throw new Error("everyMs must be >=1000");
  } else if ("cron" in t) {
    if (!t.cron || typeof t.cron.expression !== "string" || typeof t.cron.timezone !== "string" || Object.keys(t.cron).some((k2) => !["expression", "timezone"].includes(k2))) throw new Error("cron requires expression and timezone");
    new Y(t.cron.expression, { paused: true, timezone: t.cron.timezone }).stop();
  } else throw new Error("Unknown trigger");
  validateTarget(spec.target);
  return spec;
}
function nextDue(spec, now) {
  if (spec.trigger.at) return Date.parse(spec.trigger.at) > now ? spec.trigger.at : null;
  if (spec.trigger.everyMs) return iso(now + spec.trigger.everyMs);
  const cron = new Y(spec.trigger.cron.expression, { paused: true, timezone: spec.trigger.cron.timezone });
  try {
    return cron.nextRun(new Date(now))?.toISOString() ?? null;
  } finally {
    cron.stop();
  }
}
function daemonEnvironment(env) {
  const result = {};
  for (const [key, value] of Object.entries(env)) {
    if (/^(CMUX_|ORCA_|TMUX|CLAUDECODE$|CLAUDE_CODE_|CLAUDE_CONFIG_DIR$|CLAUDE_PLUGIN_|CODEX_)/.test(key)) continue;
    result[key] = value;
  }
  if (result.PATH) result.PATH = result.PATH.split(":").filter((entry) => !/cmux-cli-shims/.test(entry)).join(":");
  return result;
}
var Store = class {
  constructor(root2) {
    this.root = resolve(root2);
  }
  async init() {
    await mkdir(this.root, { recursive: true, mode: 448 });
    if ((await lstat(this.root)).isSymbolicLink()) throw new Error("Store root must not be a symlink");
    for (const dir of ["schedules", "state", "runs"]) {
      const path = join(this.root, dir);
      await mkdir(path, { recursive: true, mode: 448 });
      if ((await lstat(path)).isSymbolicLink()) throw new Error("Store directories must not be symlinks");
    }
  }
  path(dir, id) {
    if (typeof id !== "string" || !idPattern.test(id)) throw new Error("Invalid id");
    return join(this.root, dir, `${id}.json`);
  }
  async read(path) {
    try {
      if ((await lstat(path)).isSymbolicLink()) throw new Error("Refusing symlink");
      return JSON.parse(await readFile(path, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  async atomic(path, value) {
    const temp = `${path}.${randomUUID()}.tmp`;
    const file = await open(temp, "wx", 384);
    try {
      await file.writeFile(JSON.stringify(value, null, 2) + "\n");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temp, path);
  }
  async lock(name, fn) {
    await this.init();
    const path = join(this.root, `${name}.lock`);
    const deadline = Date.now() + (name === "store" ? 5e3 : 0);
    for (; ; ) {
      try {
        await mkdir(path, { mode: 448 });
        break;
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        if (Date.now() >= deadline) throw new Error(`${name} lock held; inspect status and unlock only after owner exit`);
        await new Promise((r) => setTimeout(r, 25));
      }
    }
    try {
      await this.atomic(join(path, "owner.json"), { pid: process.pid, host: hostname(), startedAt: iso(Date.now()) });
      return await fn();
    } finally {
      await rm(path, { recursive: true });
    }
  }
  // The live daemon owner on this host, or null; a stale lock does not count.
  async daemon() {
    const owner = await this.read(join(this.root, "daemon.lock", "owner.json"));
    return owner && owner.host === hostname() && Number.isSafeInteger(owner.pid) && alive(owner.pid) && !await this.read(join(this.root, "daemon.lock", "stop.json")) ? owner : null;
  }
  async unlock(name) {
    if (!["store", "daemon"].includes(name)) throw new Error("Unknown lock");
    return this.lock("recovery", async () => {
      const path = join(this.root, `${name}.lock`), owner = await this.read(join(path, "owner.json"));
      if (!owner || owner.host !== hostname() || !Number.isSafeInteger(owner.pid) || owner.pid < 1 || alive(owner.pid)) throw new Error("Owner is live or unknown; refusing unlock");
      await rm(path, { recursive: true });
      return { unlocked: name, owner };
    });
  }
  async list() {
    await this.init();
    const result = [];
    for (const name of (await readdir(join(this.root, "schedules"))).filter((n) => n.endsWith(".json")).sort()) {
      const spec = validate(await this.read(join(this.root, "schedules", name)));
      if (name !== `${spec.id}.json`) throw new Error(`Schedule filename/id mismatch: ${name}`);
      result.push({ spec, state: await this.read(this.path("state", spec.id)) });
    }
    return result;
  }
  async put(spec) {
    validate(spec);
    return this.lock("store", async () => {
      const previous = await this.read(this.path("state", spec.id));
      if (previous?.pending) throw new Error("Resolve the pending run before replacing this schedule");
      await this.atomic(this.path("schedules", spec.id), spec);
      const spent = spec.trigger.at && previous?.lastAt && Date.parse(spec.trigger.at) <= Date.parse(previous.lastAt);
      const state = { ...previous, runs: previous?.runs ?? 0, nextAt: spent ? null : spec.trigger.at ?? nextDue(spec, Date.now()) };
      await this.atomic(this.path("state", spec.id), state);
      return { spec, state };
    });
  }
  async enable(id, enabled) {
    return this.lock("store", async () => {
      const spec = await this.read(this.path("schedules", id));
      if (!spec) throw new Error("Schedule not found");
      await this.atomic(this.path("schedules", id), validate({ ...spec, enabled }));
      return { id, enabled };
    });
  }
  async remove(id) {
    return this.lock("store", async () => {
      const state = await this.read(this.path("state", id));
      if (state?.pending) throw new Error("Cannot remove a pending schedule; pause and resolve it first");
      await rm(this.path("schedules", id));
      return { id, removed: true };
    });
  }
  async removeForReceivers(receivers, agent) {
    return this.lock("store", async () => {
      const result = [];
      for (const { spec, state } of await this.list()) {
        if (!receivers.some((r) => sameReceiver(spec.target, r))) continue;
        if (spec.target.agent && (spec.target.agent.pid !== agent?.pid || spec.target.agent.startedAt !== agent?.startedAt)) continue;
        if (state?.pending) {
          await this.atomic(this.path("schedules", spec.id), { ...spec, enabled: false });
          result.push({ id: spec.id, paused: true, pending: state.pending });
        } else {
          await rm(this.path("schedules", spec.id));
          result.push({ id: spec.id, removed: true });
        }
      }
      return result;
    });
  }
  async resolveRun(id, runId) {
    return this.lock("store", async () => {
      const state = await this.read(this.path("state", id));
      const receipt = await this.read(this.path("runs", runId));
      if (!state?.pending || state.pending !== runId || !receipt || receipt.id !== id) throw new Error("Pending run mismatch");
      if (receipt.ownerHost !== hostname() || alive(receipt.ownerPid)) throw new Error("Run owner live or unknown; refusing resolution");
      await this.atomic(this.path("runs", runId), { ...receipt, status: "resolved-no-replay", finishedAt: iso(Date.now()) });
      delete state.pending;
      await this.atomic(this.path("state", id), state);
      return { id, runId, status: "resolved-no-replay" };
    });
  }
  async tick({ now = Date.now(), execute = dispatch, signal } = {}) {
    const claimed = await this.lock("store", async () => {
      const all = await this.list(), busy = /* @__PURE__ */ new Set();
      for (const { state } of all) if (state?.pending && state.targetKey) busy.add(state.targetKey);
      const selected = [];
      for (const entry of all) {
        const { spec } = entry;
        let { state } = entry;
        if (!state) {
          state = { runs: 0, nextAt: spec.trigger.at ?? nextDue(spec, now) };
          await this.atomic(this.path("state", spec.id), state);
        }
        if (!spec.enabled || state?.pending || state?.runs >= spec.maxRuns || Date.parse(spec.expiresAt) <= now) continue;
        const due = state.nextAt;
        if (!due || Date.parse(due) > now) continue;
        const key = targetKey(spec.target);
        if (busy.has(key) || state?.lastAt && now - Date.parse(state.lastAt) < (spec.cooldownMs ?? 0)) continue;
        const runId = randomUUID();
        const receipt = { runId, id: spec.id, status: "intent", startedAt: iso(now), ownerPid: process.pid, ownerHost: hostname(), definition: spec, definitionDigest: `sha256:${createHash2("sha256").update(JSON.stringify(spec)).digest("hex")}` };
        await this.atomic(this.path("runs", runId), receipt);
        await this.atomic(this.path("state", spec.id), { runs: (state?.runs ?? 0) + 1, nextAt: spec.trigger.at ? null : nextDue(spec, now), lastAt: iso(now), pending: runId, targetKey: key });
        busy.add(key);
        selected.push({ spec, receipt });
      }
      return selected;
    });
    return Promise.all(claimed.map(async ({ spec, receipt }) => {
      let result;
      try {
        result = await execute(spec.target, { timeoutMs: spec.timeoutMs, signal });
      } catch (error) {
        result = { status: "uncertain", error: error.code ?? error.message };
      }
      await this.lock("store", async () => {
        await this.atomic(this.path("runs", receipt.runId), { ...receipt, ...result, finishedAt: iso(Date.now()) });
        const state = await this.read(this.path("state", spec.id));
        const current = result.receiverGone && await this.read(this.path("schedules", spec.id));
        if (current?.enabled) await this.atomic(this.path("schedules", spec.id), { ...current, enabled: false });
        if (state?.pending === receipt.runId && result.status !== "uncertain") {
          delete state.pending;
          await this.atomic(this.path("state", spec.id), state);
        }
      });
      return { ...receipt, ...result };
    }));
  }
};

// src/ui.mjs
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readdir as readdir2, readFile as readFile2 } from "node:fs/promises";
import { join as join2 } from "node:path";
var page = true ? `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Scheduler</title>
<style>
  /* Primitive tokens */
  :root {
    --gray-0: #ffffff; --gray-50: #f6f7f9; --gray-200: #dfe2e7; --gray-400: #a3aab5; --gray-500: #5c6370; --gray-800: #23272e; --gray-900: #15181d; --gray-950: #0d0f12;
    --blue-400: #6ea8ff; --blue-600: #1f5fd1; --red-400: #ff8a80; --red-600: #b3261e; --green-400: #6fd38f; --green-700: #1d7a3d; --amber-400: #f3c063; --amber-700: #8a5a00;
    --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px;
    --radius: 6px; --font: system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo", sans-serif; --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  /* Semantic tokens; a theme changes only these values */
  :root, :root[data-theme="light"] {
    color-scheme: light;
    --bg: var(--gray-50); --surface: var(--gray-0); --border: var(--gray-200); --text: var(--gray-900); --muted: var(--gray-500);
    --accent: var(--blue-600); --on-accent: var(--gray-0); --danger: var(--red-600); --ok: var(--green-700); --warn: var(--amber-700); --focus: var(--blue-600);
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: var(--gray-950); --surface: var(--gray-900); --border: var(--gray-800); --text: var(--gray-50); --muted: var(--gray-400);
    --accent: var(--blue-400); --on-accent: var(--gray-950); --danger: var(--red-400); --ok: var(--green-400); --warn: var(--amber-400); --focus: var(--blue-400);
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 var(--font); }
  main { width: 100%; padding: var(--space-6) var(--space-6); }
  h1 { font-size: 20px; margin: 0; } h2 { font-size: 16px; margin: 0 0 var(--space-3); }
  header { display: flex; gap: var(--space-4); align-items: center; flex-wrap: wrap; margin-bottom: var(--space-6); }
  header .prefs { margin-left: auto; display: flex; gap: var(--space-3); }
  header .prefs label { display: flex; align-items: center; gap: var(--space-2); }
  section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-4); margin-bottom: var(--space-6); overflow-x: auto; }
  .muted { color: var(--muted); } .nowrap { white-space: nowrap; word-break: normal; } .mono { font-family: var(--mono); font-size: 12px; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: var(--space-2); border-bottom: 1px solid var(--border); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; font-size: 12px; }
  .button { min-height: 32px; min-width: 32px; padding: 0 var(--space-3); border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
  .button[data-variant="primary"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .button[data-variant="danger"] { color: var(--danger); border-color: var(--danger); }
  .button:disabled { opacity: .5; cursor: not-allowed; }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; scroll-margin: 80px; }
  .actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .badge { display: inline-block; padding: 0 var(--space-2); border-radius: 999px; border: 1px solid currentColor; font-size: 12px; white-space: nowrap; }
  .badge[data-tone="ok"] { color: var(--ok); } .badge[data-tone="warn"] { color: var(--warn); } .badge[data-tone="danger"] { color: var(--danger); } .badge[data-tone="muted"] { color: var(--muted); }
  label { display: grid; gap: var(--space-1); font-weight: 600; font-size: 13px; }
  input, select, textarea { font: inherit; font-weight: 400; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2); min-height: 32px; }
  input[type="checkbox"] { min-height: 24px; min-width: 24px; }
  textarea { min-height: 140px; resize: vertical; }
  .grid { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .stack { display: grid; gap: var(--space-4); }
  pre { margin: 0; padding: var(--space-3); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); max-height: 320px; overflow: auto; font: 12px/1.4 var(--mono); white-space: pre-wrap; }
  .prompt { white-space: pre-wrap; min-width: 320px; }
  [role="tablist"] { display: flex; gap: var(--space-1); border-bottom: 1px solid var(--border); margin-bottom: var(--space-4); }
  [role="tab"] { min-height: 40px; padding: 0 var(--space-4); border: 0; border-bottom: 2px solid transparent; background: none; color: var(--muted); font: inherit; font-weight: 600; cursor: pointer; }
  [role="tab"][aria-selected="true"] { color: var(--text); border-bottom-color: var(--accent); }
  [role="alert"] { color: var(--danger); min-height: 1.5em; margin: 0 0 var(--space-3); }
</style>
</head>
<body>
<main>
  <header>
    <h1>Agent Scheduler</h1><span id="status" class="muted" aria-live="polite"></span>
    <div class="prefs">
      <label><span data-i18n="language"></span><select id="lang"><option value="ko">\uD55C\uAD6D\uC5B4</option><option value="en">English</option></select></label>
      <label><span data-i18n="theme"></span><select id="theme"><option value="system" data-i18n="themeSystem"></option><option value="light" data-i18n="themeLight"></option><option value="dark" data-i18n="themeDark"></option></select></label>
    </div>
  </header>
  <p role="alert" id="error"></p>

  <div role="tablist" id="tabs">
    <button role="tab" type="button" id="tab-schedules" aria-controls="panel-schedules" aria-selected="true" data-i18n="schedules"></button>
    <button role="tab" type="button" id="tab-runs" aria-controls="panel-runs" aria-selected="false" tabindex="-1" data-i18n="runHistory"></button>
  </div>
  <div role="tabpanel" id="panel-schedules" aria-labelledby="tab-schedules">
  <section aria-labelledby="schedules-title">
    <div class="actions" style="justify-content: space-between"><h2 id="schedules-title" data-i18n="schedules"></h2>
      <div class="actions"><button class="button" type="button" id="refresh" data-i18n="refresh"></button><button class="button" data-variant="primary" type="button" id="new" data-i18n="newSchedule"></button></div></div>
    <table><thead><tr><th scope="col">ID</th><th scope="col" data-i18n="receiver"></th><th scope="col" data-i18n="prompt"></th><th scope="col" data-i18n="trigger"></th><th scope="col" data-i18n="next"></th><th scope="col" data-i18n="runs"></th><th scope="col" data-i18n="expires"></th><th scope="col" data-i18n="state"></th><th scope="col" data-i18n="actions"></th></tr></thead>
      <tbody id="schedules"></tbody></table>
  </section>

  <section aria-labelledby="form-title" id="editor" hidden>
    <h2 id="form-title"></h2>
    <form id="form" class="stack">
      <div class="grid">
        <label>ID<input name="id" required pattern="[a-zA-Z0-9][a-zA-Z0-9_\\-]{0,63}"></label>
        <label><span data-i18n="receiverTerminal"></span><select name="receiver" required></select></label>
      </div>
      <div class="actions"><button class="button" type="button" id="load-terminals" data-i18n="reloadTerminals"></button><button class="button" type="button" id="read-screen" data-i18n="showScreen"></button></div>
      <pre id="screen" hidden></pre>
      <label><span data-i18n="delivery"></span><select name="mode" aria-describedby="mode-help"><option value="prompt" data-i18n="modePrompt"></option><option value="goal" data-i18n="modeGoal"></option></select></label>
      <p id="mode-help" class="muted" data-i18n="modeHelp"></p>
      <label><span data-i18n="prompt"></span><textarea name="prompt" required maxlength="16000" aria-describedby="prompt-help"></textarea></label>
      <p id="prompt-help" class="muted" data-i18n="promptHelp"></p>
      <div class="grid">
        <label><span data-i18n="trigger"></span><select name="triggerType"><option value="everyMs" data-i18n="interval"></option><option value="cron">Cron</option><option value="at" data-i18n="once"></option></select></label>
        <label data-trigger="everyMs"><span data-i18n="intervalMinutes"></span><input name="everyMinutes" type="number" min="0.0167" step="any" value="5"></label>
        <label data-trigger="cron"><span data-i18n="cronExpression"></span><input name="cron" value="*/5 * * * *"></label>
        <label data-trigger="cron"><span data-i18n="timezone"></span><input name="timezone"></label>
        <label data-trigger="at"><span data-i18n="runAt"></span><input name="at" type="datetime-local"></label>
      </div>
      <div class="grid">
        <label><span data-i18n="maxRuns"></span><input name="maxRuns" type="number" min="1" max="100000" required value="12"></label>
        <label><span data-i18n="expires"></span><input name="expiresAt" type="datetime-local" required></label>
        <label><span data-i18n="timeoutSeconds"></span><input name="timeoutSeconds" type="number" min="0.1" max="900" step="any" required value="30"></label>
        <label><span data-i18n="cooldownMinutes"></span><input name="cooldownMinutes" type="number" min="0" max="1440" step="any" value="0"></label>
        <label style="display: flex; align-items: center; gap: var(--space-2); align-self: end"><input name="enabled" type="checkbox" checked><span data-i18n="enabled"></span></label>
      </div>
      <div class="actions"><button class="button" data-variant="primary" type="submit" data-i18n="save"></button><button class="button" type="button" id="cancel" data-i18n="cancel"></button></div>
    </form>
  </section>

  </div>
  <div role="tabpanel" id="panel-runs" aria-labelledby="tab-runs" hidden>
  <section aria-labelledby="history-title">
    <h2 id="history-title" data-i18n="recentRuns"></h2>
    <table><thead><tr><th scope="col" data-i18n="started"></th><th scope="col" data-i18n="schedule"></th><th scope="col" data-i18n="status"></th><th scope="col" data-i18n="deliveredPrompt"></th><th scope="col" data-i18n="detail"></th></tr></thead><tbody id="history"></tbody></table>
  </section>
  </div>
</main>
<script>
const messages = {
  en: {
    language: 'Language', theme: 'Theme', themeSystem: 'System', themeLight: 'Light', themeDark: 'Dark',
    schedules: 'Schedules', refresh: 'Refresh', newSchedule: 'New schedule', receiver: 'Receiver', prompt: 'Prompt', trigger: 'Trigger', next: 'Next', runs: 'Runs', expires: 'Expires', state: 'State', actions: 'Actions',
    receiverTerminal: 'Receiver terminal', reloadTerminals: 'Reload terminals', showScreen: 'Show recent screen', delivery: 'Delivery',
    modePrompt: 'Prompt \u2014 one turn', modeGoal: 'Goal \u2014 sent as /goal, works until the condition holds',
    modeHelp: 'Use Goal when the receiver should keep working across turns until a verifiable condition is met; it replaces any goal already set in that session. Use Prompt for a single check or instruction.',
    promptHelp: 'Write what the receiving session should do, in words a person can review: the goal, what to check, the completion criteria, and what to do when blocked. The exact text is stored and delivered as written; newlines become spaces.',
    interval: 'Interval', once: 'Once', intervalMinutes: 'Interval (minutes)', cronExpression: 'Cron expression', timezone: 'Timezone', runAt: 'Run at',
    maxRuns: 'Max runs', timeoutSeconds: 'Timeout (seconds)', cooldownMinutes: 'Cooldown (minutes)', enabled: 'Enabled', save: 'Save', cancel: 'Cancel',
    recentRuns: 'Recent runs', runHistory: 'Run history', started: 'Started', schedule: 'Schedule', status: 'Status', deliveredPrompt: 'Delivered prompt', detail: 'Detail',
    editTitle: id => \`Edit \${id}\`, edit: 'Edit', pause: 'Pause', resume: 'Resume', delete: 'Delete', confirmDelete: id => \`Delete schedule \${id}? Run receipts are kept.\`,
    pending: 'pending', enabledBadge: 'enabled', paused: 'paused', noSchedules: 'No schedules.', commandTarget: 'Command target \u2014 edit with the CLI',
    daemonRunning: pid => \`Daemon running (pid \${pid})\`, daemonStopped: 'Daemon is stopping',
    loading: 'Loading\u2026', selectTerminal: 'Select a terminal', noAgent: '[no running agent]', notListed: 'not currently listed', selectFirst: 'Select a terminal first',
    once_: when => \`once \${when}\`, every: min => \`every \${min} min\`, cron: (e, tz) => \`cron \${e} (\${tz})\`,
    noToken: 'Open the URL printed by \`agent-scheduler ui\`; it carries the access token.', screenLabel: 'Recent terminal screen',
  },
  ko: {
    language: '\uC5B8\uC5B4', theme: '\uD14C\uB9C8', themeSystem: '\uC2DC\uC2A4\uD15C', themeLight: '\uB77C\uC774\uD2B8', themeDark: '\uB2E4\uD06C',
    schedules: '\uC2A4\uCF00\uC904', refresh: '\uC0C8\uB85C\uACE0\uCE68', newSchedule: '\uC0C8 \uC2A4\uCF00\uC904', receiver: '\uC218\uC2E0 \uB300\uC0C1', prompt: '\uD504\uB86C\uD504\uD2B8', trigger: '\uC2E4\uD589 \uC870\uAC74', next: '\uB2E4\uC74C \uC2E4\uD589', runs: '\uC2E4\uD589 \uD69F\uC218', expires: '\uB9CC\uB8CC', state: '\uC0C1\uD0DC', actions: '\uC791\uC5C5',
    receiverTerminal: '\uC218\uC2E0 \uD130\uBBF8\uB110', reloadTerminals: '\uD130\uBBF8\uB110 \uB2E4\uC2DC \uBD88\uB7EC\uC624\uAE30', showScreen: '\uCD5C\uADFC \uD654\uBA74 \uBCF4\uAE30', delivery: '\uC804\uB2EC \uBC29\uC2DD',
    modePrompt: '\uD504\uB86C\uD504\uD2B8 \u2014 \uD55C \uD134', modeGoal: '\uBAA9\uD45C \u2014 /goal \uB85C \uBCF4\uB0B4\uACE0 \uC870\uAC74\uC744 \uB9CC\uC871\uD560 \uB54C\uAE4C\uC9C0 \uC9C4\uD589',
    modeHelp: '\uC218\uC2E0 \uC138\uC158\uC774 \uD655\uC778 \uAC00\uB2A5\uD55C \uC870\uAC74\uC744 \uB9CC\uC871\uD560 \uB54C\uAE4C\uC9C0 \uC5EC\uB7EC \uD134\uC5D0 \uAC78\uCCD0 \uACC4\uC18D \uC791\uC5C5\uD574\uC57C \uD558\uBA74 \uBAA9\uD45C\uB97C \uACE0\uB985\uB2C8\uB2E4. \uADF8 \uC138\uC158\uC5D0 \uC774\uBBF8 \uC124\uC815\uB41C \uBAA9\uD45C\uB294 \uB300\uCCB4\uB429\uB2C8\uB2E4. \uD55C \uBC88\uC758 \uD655\uC778\uC774\uB098 \uC9C0\uC2DC\uB294 \uD504\uB86C\uD504\uD2B8\uB97C \uACE0\uB985\uB2C8\uB2E4.',
    promptHelp: '\uC218\uC2E0 \uC138\uC158\uC774 \uD560 \uC77C\uC744 \uC0AC\uB78C\uC774 \uAC80\uD1A0\uD560 \uC218 \uC788\uB294 \uBB38\uC7A5\uC73C\uB85C \uC501\uB2C8\uB2E4: \uBAA9\uC801, \uD655\uC778\uD560 \uB300\uC0C1, \uC644\uB8CC \uAE30\uC900, \uB9C9\uD614\uC744 \uB54C \uD560 \uC77C. \uC785\uB825\uD55C \uBB38\uC7A5\uC774 \uADF8\uB300\uB85C \uC800\uC7A5\uB418\uACE0 \uC804\uB2EC\uB418\uBA70, \uC904\uBC14\uAFC8\uC740 \uACF5\uBC31\uC774 \uB429\uB2C8\uB2E4.',
    interval: '\uBC18\uBCF5 \uAC04\uACA9', once: '\uD55C \uBC88', intervalMinutes: '\uAC04\uACA9(\uBD84)', cronExpression: 'Cron \uC2DD', timezone: '\uC2DC\uAC04\uB300', runAt: '\uC2E4\uD589 \uC2DC\uAC01',
    maxRuns: '\uCD5C\uB300 \uC2E4\uD589 \uD69F\uC218', timeoutSeconds: '\uC81C\uD55C \uC2DC\uAC04(\uCD08)', cooldownMinutes: '\uCD5C\uC18C \uAC04\uACA9(\uBD84)', enabled: '\uC0AC\uC6A9', save: '\uC800\uC7A5', cancel: '\uCDE8\uC18C',
    recentRuns: '\uCD5C\uADFC \uC2E4\uD589 \uAE30\uB85D', runHistory: '\uC2E4\uD589 \uAE30\uB85D', started: '\uC2DC\uC791', schedule: '\uC2A4\uCF00\uC904', status: '\uACB0\uACFC', deliveredPrompt: '\uC804\uB2EC\uB41C \uD504\uB86C\uD504\uD2B8', detail: '\uC0C1\uC138',
    editTitle: id => \`\${id} \uC218\uC815\`, edit: '\uC218\uC815', pause: '\uC77C\uC2DC\uC815\uC9C0', resume: '\uC7AC\uAC1C', delete: '\uC0AD\uC81C', confirmDelete: id => \`\${id} \uC2A4\uCF00\uC904\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694? \uC2E4\uD589 \uAE30\uB85D\uC740 \uB0A8\uC2B5\uB2C8\uB2E4.\`,
    pending: '\uD655\uC778 \uD544\uC694', enabledBadge: '\uC0AC\uC6A9 \uC911', paused: '\uC77C\uC2DC\uC815\uC9C0', noSchedules: '\uC2A4\uCF00\uC904\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', commandTarget: '\uBA85\uB839 \uB300\uC0C1 \u2014 CLI \uB85C \uC218\uC815',
    daemonRunning: pid => \`\uB370\uBAAC \uC2E4\uD589 \uC911 (pid \${pid})\`, daemonStopped: '\uB370\uBAAC\uC774 \uC885\uB8CC \uC911\uC785\uB2C8\uB2E4',
    loading: '\uBD88\uB7EC\uC624\uB294 \uC911\u2026', selectTerminal: '\uD130\uBBF8\uB110\uC744 \uC120\uD0DD\uD558\uC138\uC694', noAgent: '[\uC2E4\uD589 \uC911\uC778 \uC5D0\uC774\uC804\uD2B8 \uC5C6\uC74C]', notListed: '\uD604\uC7AC \uBAA9\uB85D\uC5D0 \uC5C6\uC74C', selectFirst: '\uBA3C\uC800 \uD130\uBBF8\uB110\uC744 \uC120\uD0DD\uD558\uC138\uC694',
    once_: when => \`\uD55C \uBC88 \${when}\`, every: min => \`\${min}\uBD84\uB9C8\uB2E4\`, cron: (e, tz) => \`cron \${e} (\${tz})\`,
    noToken: '\`agent-scheduler ui\` \uAC00 \uCD9C\uB825\uD55C \uC8FC\uC18C\uB85C \uC5EC\uC138\uC694. \uADF8 \uC8FC\uC18C\uC5D0 \uC811\uADFC \uD1A0\uD070\uC774 \uB4E4\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.', screenLabel: '\uCD5C\uADFC \uD130\uBBF8\uB110 \uD654\uBA74',
  },
};
const token = new URLSearchParams(location.hash.slice(1)).get('token');
const $ = id => document.getElementById(id);
const form = $('form');
let schedules = [], editing = null, lastError = null, receivers = new Map(), labelsRequested = false;
let lang = localStorage.getItem('lang') ?? (navigator.language?.startsWith('ko') ? 'ko' : 'en');
const t = (key, ...args) => { const value = messages[lang][key]; return typeof value === 'function' ? value(...args) : value; };

const dark = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const choice = localStorage.getItem('theme') ?? 'system';
  $('theme').value = choice;
  document.documentElement.dataset.theme = choice === 'system' ? (dark.matches ? 'dark' : 'light') : choice;
}
function applyLanguage() {
  document.documentElement.lang = lang; $('lang').value = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  $('screen').setAttribute('aria-label', t('screenLabel'));
  $('form-title').textContent = editing ? t('editTitle', editing) : t('newSchedule');
  if (lastError) $('error').textContent = lastError.key ? t(lastError.key) : lastError.message;
}
$('theme').addEventListener('change', e => { localStorage.setItem('theme', e.target.value); applyTheme(); });
dark.addEventListener('change', applyTheme);
$('lang').addEventListener('change', e => { lang = e.target.value; localStorage.setItem('lang', lang); applyLanguage(); refresh(); if (!$('editor').hidden) loadTerminals(form.receiver.value && JSON.parse(form.receiver.value)); });

async function api(method, path, value) {
  const res = await fetch(path, { method, headers: { authorization: \`Bearer \${token}\`, 'content-type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}
// Server errors are shown verbatim; page messages follow the selected language.
const fail = error => { lastError = error; $('error').textContent = error.key ? t(error.key) : error.message; };
const clearError = () => { lastError = null; $('error').textContent = ''; };
const cell = (text, className) => { const td = document.createElement('td'); td.textContent = text ?? '\u2014'; if (className) td.className = className; return td; };
const when = value => value ? new Date(value).toLocaleString(lang) : '\u2014';
const local = value => { const d = new Date(value), p = n => String(n).padStart(2, '0'); return \`\${d.getFullYear()}-\${p(d.getMonth() + 1)}-\${p(d.getDate())}T\${p(d.getHours())}:\${p(d.getMinutes())}\`; };
const badge = (text, tone) => { const s = document.createElement('span'); s.className = 'badge'; s.dataset.tone = tone; s.textContent = text; return s; };
const describeTarget = x => x.type === 'command' ? \`command \${x.argv.join(' ')}\` : x.type === 'cmux' ? \`cmux \${x.workspace} / \${x.surface}\` : x.type === 'orca' ? \`orca \${x.terminal}\` : \`tmux \${x.socket} \${x.pane}\`;
const describeTrigger = x => x.at ? t('once_', when(x.at)) : x.everyMs ? t('every', x.everyMs / 60000) : t('cron', x.cron.expression, x.cron.timezone);
const delivered = target => target?.prompt ? \`\${target.mode === 'goal' ? '/goal ' : ''}\${target.prompt}\` : '\u2014';
const button = (label, variant, onClick, disabled) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'button'; b.textContent = label; if (variant) b.dataset.variant = variant; b.disabled = !!disabled; b.addEventListener('click', onClick); return b; };

async function refresh() {
  clearError();
  try {
    // Receiver names arrive later; schedules render first and are relabelled once they load.
    if (!labelsRequested) { labelsRequested = true; remember(api('GET', '/api/terminals')).then(refresh, () => {}); }
    const [list, runs, status] = await Promise.all([api('GET', '/api/schedules'), api('GET', '/api/history'), api('GET', '/api/status')]);
    schedules = list;
    $('status').textContent = \`\${status.daemon ? t('daemonRunning', status.daemon.pid) : t('daemonStopped')} \xB7 \${status.store}\`;
    const body = $('schedules'); body.replaceChildren();
    for (const { spec, state } of list) {
      const tr = document.createElement('tr');
      const s = cell(''); s.replaceChildren(state?.pending ? badge(t('pending'), 'warn') : spec.enabled ? badge(t('enabledBadge'), 'ok') : badge(t('paused'), 'muted'));
      const actions = document.createElement('td'); actions.className = 'actions';
      const command = spec.target.type === 'command', id = encodeURIComponent(spec.id);
      actions.append(
        button(t('edit'), null, () => openEditor(spec), command || state?.pending),
        button(spec.enabled ? t('pause') : t('resume'), null, () => act('POST', \`/api/schedules/\${id}/\${spec.enabled ? 'pause' : 'resume'}\`)),
        button(t('delete'), 'danger', () => confirm(t('confirmDelete', spec.id)) && act('DELETE', \`/api/schedules/\${id}\`), state?.pending));
      const known = command ? null : receivers.get(receiverKey(spec.target));
      const target = cell(known ? known.label : describeTarget(spec.target), known ? null : 'mono');
      if (known) { const sub = document.createElement('div'); sub.className = 'mono muted'; sub.textContent = describeTarget(spec.target); target.append(sub); }
      tr.append(cell(spec.id, 'mono nowrap'), target, cell(command ? t('commandTarget') : delivered(spec.target), 'prompt'), cell(describeTrigger(spec.trigger)), cell(when(state?.nextAt)), cell(\`\${state?.runs ?? 0} / \${spec.maxRuns}\`), cell(when(spec.expiresAt)), s, actions);
      body.append(tr);
    }
    if (!list.length) { const tr = document.createElement('tr'); const td = cell(t('noSchedules'), 'muted'); td.colSpan = 9; tr.append(td); body.append(tr); }
    const hist = $('history'); hist.replaceChildren();
    for (const run of runs.filter(Boolean).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 50)) {
      const tr = document.createElement('tr'); const st = cell('');
      st.replaceChildren(badge(run.status, run.status === 'uncertain' || run.status === 'intent' ? 'danger' : run.status === 'not-delivered' ? 'warn' : 'ok'));
      tr.append(cell(when(run.startedAt)), cell(run.id, 'mono'), st, cell(delivered(run.definition?.target), 'prompt'), cell(run.error ?? run.acknowledgment, 'muted'));
      hist.append(tr);
    }
  } catch (error) { fail(error); }
}
const receiverKey = ({ prompt, mode, agent, ...rest }) => JSON.stringify(rest).toLowerCase();
async function remember(promise) {
  const groups = await promise;
  receivers = new Map(groups.flatMap(g => g.terminals.map(x => [receiverKey(x.target), x])));
  return groups;
}
async function act(method, path) { try { await api(method, path); await refresh(); } catch (error) { fail(error); } }

async function loadTerminals(selected) {
  const select = form.receiver; select.replaceChildren(new Option(t('loading'), ''));
  try {
    const groups = await remember(api('GET', '/api/terminals'));
    select.replaceChildren(new Option(t('selectTerminal'), ''));
    for (const g of groups) {
      const og = document.createElement('optgroup'); og.label = g.available ? g.type : \`\${g.type} \u2014 \${g.error}\`;
      for (const x of g.terminals) {
        // A receiver without a running agent would get the prompt typed into a shell.
        const option = new Option([x.live ? x.agent && \`[\${x.agent}]\` : t('noAgent'), x.label, x.group && \`\xB7 \${x.group}\`, x.cwd && \`\xB7 \${x.cwd}\`].filter(Boolean).join(' '), JSON.stringify(x.target));
        option.disabled = !x.live; og.append(option);
      }
      if (!g.terminals.length) og.disabled = true;
      select.append(og);
    }
    if (selected) {
      const key = JSON.stringify(selected);
      if (![...select.options].some(o => o.value === key)) select.append(new Option(\`\${describeTarget(selected)} (\${t('notListed')})\`, key));
      select.value = key;
    }
  } catch (error) { fail(error); }
}
function showTrigger() { for (const el of form.querySelectorAll('[data-trigger]')) el.hidden = el.dataset.trigger !== form.triggerType.value; }
function openEditor(spec) {
  editing = spec?.id ?? null; form.reset(); $('screen').hidden = true;
  $('form-title').textContent = editing ? t('editTitle', editing) : t('newSchedule');
  form.id.readOnly = !!editing;
  form.timezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  form.expiresAt.value = local(Date.now() + 7 * 864e5);
  if (spec) {
    form.id.value = spec.id; form.prompt.value = spec.target.prompt; form.mode.value = spec.target.mode ?? 'prompt'; form.enabled.checked = spec.enabled;
    form.maxRuns.value = spec.maxRuns; form.expiresAt.value = local(spec.expiresAt); form.timeoutSeconds.value = spec.timeoutMs / 1000; form.cooldownMinutes.value = (spec.cooldownMs ?? 0) / 60000;
    const x = spec.trigger; form.triggerType.value = x.at ? 'at' : x.everyMs ? 'everyMs' : 'cron';
    if (x.at) form.at.value = local(x.at);
    if (x.everyMs) form.everyMinutes.value = x.everyMs / 60000;
    if (x.cron) { form.cron.value = x.cron.expression; form.timezone.value = x.cron.timezone; }
  }
  showTrigger(); $('editor').hidden = false; loadTerminals(spec?.target && (({ prompt, mode, ...rest }) => rest)(spec.target)); form.id.focus();
}
form.triggerType.addEventListener('change', showTrigger);
$('new').addEventListener('click', () => openEditor());
$('refresh').addEventListener('click', refresh);
$('cancel').addEventListener('click', () => { $('editor').hidden = true; editing = null; });
$('load-terminals').addEventListener('click', () => loadTerminals(form.receiver.value && JSON.parse(form.receiver.value)));
$('read-screen').addEventListener('click', async () => {
  if (!form.receiver.value) return fail({ key: 'selectFirst' });
  try { const { screen } = await api('POST', '/api/terminals/read', { target: JSON.parse(form.receiver.value) }); $('screen').textContent = screen; $('screen').hidden = false; }
  catch (error) { fail(error); }
});
form.addEventListener('submit', async event => {
  event.preventDefault(); clearError();
  const f = form, type = f.triggerType.value;
  const trigger = type === 'at' ? { at: new Date(f.at.value).toISOString() } : type === 'everyMs' ? { everyMs: Math.round(Number(f.everyMinutes.value) * 60000) } : { cron: { expression: f.cron.value.trim(), timezone: f.timezone.value.trim() } };
  const spec = { schemaVersion: 1, id: f.id.value.trim(), enabled: f.enabled.checked, trigger, target: { ...JSON.parse(f.receiver.value), mode: f.mode.value, prompt: f.prompt.value }, maxRuns: Number(f.maxRuns.value), expiresAt: new Date(f.expiresAt.value).toISOString(), timeoutMs: Math.round(Number(f.timeoutSeconds.value) * 1000) };
  const cooldown = Math.round(Number(f.cooldownMinutes.value) * 60000); if (cooldown) spec.cooldownMs = cooldown;
  try {
    await api(editing ? 'PUT' : 'POST', editing ? \`/api/schedules/\${encodeURIComponent(editing)}\` : '/api/schedules', spec);
    $('editor').hidden = true; editing = null; await refresh();
  } catch (error) { fail(error); }
});
const tabs = [$('tab-schedules'), $('tab-runs')];
function selectTab(tab, focus) {
  for (const t of tabs) {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected)); t.tabIndex = selected ? 0 : -1;
    $(t.getAttribute('aria-controls')).hidden = !selected;
  }
  localStorage.setItem('tab', tab.id);
  if (focus) tab.focus();
}
for (const t of tabs) {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', e => {
    const i = tabs.indexOf(t), next = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : e.key === 'ArrowLeft' ? tabs[(i + tabs.length - 1) % tabs.length] : e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs.at(-1) : null;
    if (next) { e.preventDefault(); selectTab(next, true); }
  });
}
selectTab($(localStorage.getItem('tab') ?? 'tab-schedules') ?? tabs[0]);
applyTheme(); applyLanguage();
if (!token) fail({ key: 'noToken' });
else refresh();
</script>
</body>
</html>
` : await readFile2(new URL("./ui.html", import.meta.url), "utf8");
var limit = 1 << 20;
var body = (req) => new Promise((resolve2, reject) => {
  let data = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    data += chunk;
    if (data.length > limit) {
      reject(Object.assign(new Error("Request too large"), { status: 413 }));
      req.destroy();
    }
  });
  req.on("end", () => {
    try {
      resolve2(data ? JSON.parse(data) : {});
    } catch {
      reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
    }
  });
  req.on("error", reject);
});
async function history(store2) {
  const files = (await readdir2(join2(store2.root, "runs"))).filter((n) => n.endsWith(".json")).sort();
  return Promise.all(files.map((n) => store2.read(join2(store2.root, "runs", n))));
}
async function status(store2) {
  return { store: store2.root, daemon: await store2.daemon(), daemonLock: await store2.read(join2(store2.root, "daemon.lock", "owner.json")), storeLock: await store2.read(join2(store2.root, "store.lock", "owner.json")) };
}
var terminalSpec = (spec) => {
  if (spec?.target?.type === "command") throw Object.assign(new Error("Command targets are registered and edited with the CLI"), { status: 403 });
  return spec;
};
function createUi(store2, { token = randomBytes(24).toString("base64url"), terminals: terminals2 = listTerminals, read = readTerminal } = {}) {
  const expected = Buffer.from(`Bearer ${token}`);
  const routes = {
    "GET /api/schedules": () => store2.list(),
    "GET /api/history": () => history(store2),
    "GET /api/status": () => status(store2),
    "GET /api/terminals": () => terminals2(),
    // The screen is context for the person writing the prompt; nothing is sent to the terminal.
    "POST /api/terminals/read": async (req) => ({ screen: await read((await body(req)).target) }),
    "POST /api/schedules": async (req) => {
      const spec = terminalSpec(await body(req));
      if (await store2.read(store2.path("schedules", spec.id))) throw Object.assign(new Error("Schedule id already exists"), { status: 409 });
      return store2.put(spec);
    },
    "PUT /api/schedules/:id": async (req, id) => {
      const spec = terminalSpec(await body(req));
      if (spec.id !== id) throw Object.assign(new Error("Schedule id cannot change"), { status: 400 });
      const current = await store2.read(store2.path("schedules", id));
      if (!current) throw Object.assign(new Error("Schedule not found"), { status: 404 });
      terminalSpec(current);
      return store2.put(spec);
    },
    "POST /api/schedules/:id/pause": (req, id) => store2.enable(id, false),
    "POST /api/schedules/:id/resume": (req, id) => store2.enable(id, true),
    "DELETE /api/schedules/:id": (req, id) => store2.remove(id)
  };
  const server = createServer(async (req, res) => {
    const send = (code, value, type = "application/json") => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'" });
      res.end(type === "application/json" ? JSON.stringify(value) : value);
    };
    try {
      const { port: port2 } = server.address();
      if (![`127.0.0.1:${port2}`, `localhost:${port2}`].includes(req.headers.host)) return send(421, { error: "Unexpected host" });
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === "GET" && url.pathname === "/") return send(200, page, "text/html; charset=utf-8");
      const auth = Buffer.from(req.headers.authorization ?? "");
      if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return send(401, { error: "Unauthorized" });
      const parts = url.pathname.split("/");
      const id = parts[3] && decodeURIComponent(parts[3]);
      const route = parts[2] === "schedules" && parts.length > 3 ? ["/api/schedules/:id", ...parts.slice(4)].join("/") : url.pathname;
      const handler = routes[`${req.method} ${route}`];
      if (!handler) return send(404, { error: "Not found" });
      send(200, await handler(req, id));
    } catch (error) {
      send(error.status ?? 400, { error: error.message });
    }
  });
  return { server, token };
}

// src/cli.mjs
var args = process.argv.slice(2);
var root = process.env.AGENT_SCHEDULER_HOME ?? join3(homedir(), ".local", "state", "agent-scheduler");
var store = new Store(root);
var [command, ...rest] = args;
var print = (value) => process.stdout.write(JSON.stringify(value, null, 2) + "\n");
var port = Number(process.env.AGENT_SCHEDULER_PORT ?? 47800);
async function uiToken() {
  const path = join3(store.root, "ui-token");
  const read = async () => (await readFile3(path, "utf8").catch(() => "")).trim();
  if (await read()) return read();
  const temp = `${path}.${process.pid}.${randomBytes2(4).toString("hex")}.tmp`;
  const file = await open2(temp, "wx", 384);
  try {
    await file.writeFile(randomBytes2(24).toString("base64url"));
    await file.sync();
  } finally {
    await file.close();
  }
  await link(temp, path).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  await rm2(temp, { force: true });
  const token = await read();
  if (!token) throw new Error("Management page token is empty");
  return token;
}
var pagePath = () => join3(store.root, "daemon.lock", "page.json");
async function page2(waitMs = 0) {
  const owner = await store.daemon();
  for (let waited = 0; ; waited += 100) {
    const state = await store.read(pagePath());
    if (owner && state?.pid === owner.pid) return state.listening ? { listening: true, url: `http://127.0.0.1:${state.port}/` } : { listening: false, error: state.error };
    if (waited >= waitMs) return { listening: false, error: owner ? "management page not ready" : "daemon not running" };
    await new Promise((r) => setTimeout(r, 100));
  }
}
async function startDaemon() {
  const lockOwner = () => store.read(join3(store.root, "daemon.lock", "owner.json"));
  for (let i3 = 0; i3 < 150 && await lockOwner() && !await store.daemon(); i3++) {
    if (i3 === 0 || i3 % 10 === 0) await store.unlock("daemon").catch(() => {
    });
    await new Promise((r) => setTimeout(r, 100));
  }
  const running = await store.daemon();
  if (running) return { status: "running", ...running };
  if (await lockOwner()) throw new Error("Daemon lock is held by a stopping or unknown owner; inspect status");
  const log = await open2(join3(store.root, "daemon.log"), "a", 384);
  try {
    const child = spawn2(process.execPath, [fileURLToPath(import.meta.url), "serve"], { detached: true, stdio: ["ignore", log.fd, log.fd], env: { ...daemonEnvironment(process.env), AGENT_SCHEDULER_HOME: store.root } });
    child.unref();
    for (let i3 = 0; i3 < 50; i3++) {
      await new Promise((r) => setTimeout(r, 100));
      const owner = await store.daemon();
      if (owner) return { status: owner.pid === child.pid ? "started" : "running", ...owner };
    }
    throw new Error("Daemon did not start; inspect daemon.log");
  } finally {
    await log.close();
  }
}
async function ensureDaemon() {
  const owner = await store.daemon();
  return owner ? { status: "running", ...owner } : startDaemon();
}
try {
  await store.init();
  if (!command || command === "help" || command === "--help") {
    console.log(`agent-scheduler 0.3.1 \u2014 Node >=22

Usage: agent-scheduler COMMAND

One global store and daemon serve all coding agents on this computer.
Registering or resuming starts the daemon when it is absent.

put FILE|-       Validate and register a JSON schedule
list             List definitions and runtime state
pause ID         Disable future dispatch
resume ID        Enable future dispatch
remove ID        Remove definition, retain receipts
resolve ID RUN   Acknowledge uncertain run after owner exit; never replay
tick             Dispatch due schedules once
serve            Run scheduler in foreground
start            Start the global daemon (scheduler and management page) if absent
stop             Request graceful daemon stop
status           Inspect daemon owner and store
history          Read run receipts
unlock NAME      Remove store/daemon lock only after confirmed owner exit
terminals        List cmux, orca and tmux receivers
session-end      Remove schedules addressed to this terminal (session end hook)
ui               Start the daemon if needed and print the management page URL

No API key or model process is required.`);
  } else if (command === "put") {
    if (rest.length !== 1) throw new Error("put requires FILE or -");
    let input;
    if (rest[0] === "-") {
      input = "";
      for await (const chunk of process.stdin) input += chunk;
    } else input = await readFile3(rest[0], "utf8");
    const spec = validate(JSON.parse(input));
    const daemon = await ensureDaemon();
    print({ ...await store.put(spec), daemon });
  } else if (command === "list") print(await store.list());
  else if (command === "pause" || command === "resume") {
    const daemon = command === "resume" ? await ensureDaemon() : void 0;
    print({ ...await store.enable(rest[0], command === "resume"), ...daemon ? { daemon } : {} });
  } else if (command === "remove") print(await store.remove(rest[0]));
  else if (command === "resolve") print(await store.resolveRun(rest[0], rest[1]));
  else if (command === "unlock") print(await store.unlock(rest[0]));
  else if (command === "tick") print(await store.tick());
  else if (command === "history") print(await history(store));
  else if (command === "status") print({ ...await status(store), page: await page2() });
  else if (command === "terminals") print(await listTerminals());
  else if (command === "session-end") {
    let input = "";
    if (!process.stdin.isTTY) for await (const chunk of process.stdin) input += chunk;
    let hook = {};
    try {
      hook = input.trim() ? JSON.parse(input) : {};
    } catch {
      hook = {};
    }
    if (["clear", "resume"].includes(hook.reason)) print({ skipped: hook.reason });
    else {
      const receivers = await currentReceivers();
      const agent = receivers.length ? await agentForSession(hook.session_id) : null;
      print({ receivers, agent, schedules: receivers.length ? await store.removeForReceivers(receivers, agent) : [] });
    }
  } else if (command === "ui") {
    const daemon = await ensureDaemon();
    const state = await page2(5e3);
    if (!state.listening) throw new Error(`Management page unavailable: ${state.error}; see daemon.log`);
    print({ url: `${state.url}#token=${await uiToken()}`, daemon, store: store.root });
  } else if (command === "serve") {
    await store.lock("daemon", async () => {
      const { server } = createUi(store, { token: await uiToken() });
      const state = await new Promise((resolve2) => {
        server.once("error", (error) => resolve2({ listening: false, error: error.code ?? error.message }));
        server.listen(port, "127.0.0.1", () => resolve2({ listening: true }));
      });
      await store.atomic(pagePath(), { pid: process.pid, port, ...state, at: (/* @__PURE__ */ new Date()).toISOString() });
      print({ page: state, port, at: (/* @__PURE__ */ new Date()).toISOString() });
      const controller = new AbortController();
      const active = /* @__PURE__ */ new Set();
      let stopping = false;
      const stop = () => {
        stopping = true;
        controller.abort();
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      try {
        while (!stopping) {
          if (await store.read(join3(store.root, "daemon.lock", "stop.json"))) {
            stop();
            break;
          }
          const run = store.tick({ signal: controller.signal }).then((runs) => {
            if (runs.length) print(runs);
          }).catch((error) => {
            process.stderr.write(JSON.stringify({ error: error.message, at: (/* @__PURE__ */ new Date()).toISOString() }) + "\n");
          }).finally(() => active.delete(run));
          active.add(run);
          if (!stopping) await new Promise((r) => setTimeout(r, 1e3));
        }
      } finally {
        controller.abort();
        server.close();
        await Promise.all(active);
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
      }
    });
  } else if (command === "start") print({ ...await ensureDaemon(), store: store.root, page: await page2(5e3) });
  else if (command === "stop") {
    const path = join3(store.root, "daemon.lock");
    const owner = await store.read(join3(path, "owner.json"));
    if (!owner) throw new Error("No daemon owner");
    await store.atomic(join3(path, "stop.json"), { owner });
    print({ status: "stop-requested", owner });
  } else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  process.stderr.write(JSON.stringify({ error: error.message }) + "\n");
  process.exitCode = 1;
}
