/*
  ビル神輿 BGM「A1」
  A（sakamoto）の響き（拡張和音・空間・シンセの質感）を下に敷き、江戸祭囃子を前に出した曲。
  主役は囃子の勢い。締太鼓2人の噛み合い、大胴の合いの手、鉦のチャンチキ、篠笛の主題。

  ・旋律は民謡音階（ミ・ソ・ラ・シ・レ ＝ E G A B D）の五音だけ。夜明け（back）は同じ五音でソを中心にする。
  ・和音は A と同じドビュッシーふうの拡張和音（maj9・6/9・11・#11）。のこぎり波のパッドを鳴らし続け、和音ごとに音程だけを動かす。
  ・担ぐ場面は12小節の「段」：道中（主題）→上げ→山→抜け→連打→投げ合い。山で一番厚く、抜けで一瞬引き、連打で次の段に入る。
    テンポも段ごとに 124 → 128 → 132 と上がり、抜けで戻る。
  ・鉦は本物に近づけた：雑音の擦れと、すぐ消える不協和な鳴りで作った短く乾いた音（A の澄んで響く FM の鉦はやめた）。
  ・A の鈴（ガムランふうの FM ベル）は、選ぶ画面と夜明けにだけ残した。担ぐ場面では囃子を前に出すため、
    鈴の代わりにこもった「はじく音」（のこぎり波＋閉じていくローパス）が和音を刻む。
  ・篠笛は C（kiso）の作り方：1本の息で吹き続ける1声。倍音の波形＋息の雑音＋ずり上げ＋遅れて入るビブラート＋指打ち。
  ・音源ファイルは使わない。乱数は種を固定したハッシュで、書き出すたびに同じ音になる。
*/
window.MIKOSHI_BGM = window.MIKOSHI_BGM || {};
window.MIKOSHI_BGM['a1'] = function create(ctx, dest) {
  'use strict';

  /* ================= 1. 決めごと ================= */

  /* 出口の音量。書き出しで carry を測って、ここだけ動かす */
  /* 10/23 書き出しで測って 1.6 → 0.94（担ぐ区間 12〜30秒が −13.4 LUFS だったので −4.6dB。目標 −18 LUFS） */
  const MASTER = 0.94;
  const SEED = 0xa1a11023;
  const SR = ctx.sampleRate;

  /* 機械の揺れ（A の MC-8 の作り）：16分の位置ごとの決まったずれ（ミリ秒）と、裏の16分の跳ね */
  const MICRO = [0, 2, -1, 3, 0, 3, -2, 2, 1, 3, -1, 3, 0, 2, -2, 3];
  const SWING = 0.08;

  /* 場面ごとのテンポ。担ぐ場面は段ごとに上下する（SEC_BPM）。お祓いの間は音が無いので、魂振りの速さへ先に寄せておく */
  const BPM = { idle: 118, carry: 126, stuck: 126, harai: 144, tamafuri: 144, back: 104 };

  /*
    場面ごとの層の音量（0〜1）。
    rev は残響へ送る量、dlp は太鼓の遠さ（太鼓と鉦にかけるローパス）、plp はパッドの明るさ（ローパス）。
  */
  const MIX = {
    idle:     { pad: 0.72, pluck: 0.6,  bell: 0.72, bass: 0,    shime: 0.5,  od: 0.52, kane: 0.46, fue: 0.72, sho: 0,   air: 0.72, rev: 0.6,  dlp: 1300,  plp: 750 },
    carry:    { pad: 0.34, pluck: 0.32, bell: 0,    bass: 0.5,  shime: 0.9,  od: 0.85, kane: 0.62, fue: 0.85, sho: 0,   air: 0,    rev: 0.26, dlp: 12000, plp: 1000 },
    stuck:    { pad: 0.4,  pluck: 0,    bell: 0,    bass: 0,    shime: 0.5,  od: 0,    kane: 0,    fue: 0.8,  sho: 0,   air: 0.35, rev: 0.55, dlp: 6000,  plp: 700 },
    harai:    { pad: 0.32, pluck: 0,    bell: 0,    bass: 0,    shime: 0,    od: 0,    kane: 0,    fue: 0,    sho: 0.7, air: 0.3,  rev: 0.6,  dlp: 6000,  plp: 600 },
    tamafuri: { pad: 0.5,  pluck: 0,    bell: 0,    bass: 0.65, shime: 1,    od: 1,    kane: 0.75, fue: 0.85, sho: 0,   air: 0,    rev: 0.3,  dlp: 15000, plp: 2600 },
    back:     { pad: 0.6,  pluck: 0.36, bell: 0.54, bass: 0.36, shime: 0.5,  od: 0.5,  kane: 0.36, fue: 0.84, sho: 0,   air: 0.42, rev: 0.45, dlp: 5000,  plp: 900 }
  };
  const LAYERS = ['pad', 'pluck', 'bell', 'bass', 'shime', 'od', 'kane', 'fue', 'sho', 'air'];

  /* 音階（民謡音階 E G A B D。C=0 の音名の番号） */
  const PC = [2, 4, 7, 9, 11];

  /*
    和音（root は低音の根音、v はパッドの5声）。A の作りと同じ拡張和音。
  */
  const C = {
    Em11:  { root: 52, v: [52, 59, 62, 67, 69] },
    Em9:   { root: 52, v: [52, 59, 62, 66, 67] },
    EmHi:  { root: 52, v: [52, 59, 64, 66, 71] },
    Cmaj9: { root: 48, v: [48, 55, 59, 62, 64] },
    Cm7s:  { root: 48, v: [48, 55, 59, 64, 66] },
    D6s2:  { root: 50, v: [50, 57, 59, 64, 69] },
    D69:   { root: 50, v: [50, 54, 59, 64, 69] },
    Am11:  { root: 45, v: [57, 60, 62, 64, 67] },
    Bm11:  { root: 47, v: [47, 54, 57, 62, 64] },
    Gmaj9: { root: 55, v: [55, 62, 66, 69, 71] },
    G69:   { root: 55, v: [55, 62, 64, 69, 71] },
    Cm9s:  { root: 48, v: [48, 55, 59, 62, 66] },
    TAMA:  { root: 52, v: [52, 62, 66, 69, 76] },
    HARAI: { root: 52, v: [52, 59, 64, 66, 71] }
  };
  /* 選ぶ画面：Em9 と Cmaj9(#11) を2小節ずつ行き来する（A と同じ） */
  const IDLE = [C.Em9, C.Cm9s];
  /* 夜明け：Gmaj9 → Cmaj9(#11) → Em11 → D6sus2 → G6/9 → Am11 → Cmaj7(#11) → D6/9（A と同じ） */
  const DAWN = [C.Gmaj9, C.Cm9s, C.Em11, C.D6s2, C.G69, C.Am11, C.Cm7s, C.D69];

  /*
    担ぐ場面の段（12小節で一回り）。
      0〜1 道中（主題の問い）／2〜3 道中（主題の答え）／4〜5 上げ（主題を4度上で）／6〜7 山（主題を1オクターブ上で）／
      8 抜け（太鼓が消えて笛の長い音と和音だけ）／9 連打（締太鼓の連打で次へ）／10〜11 投げ合い（笛が投げて太鼓が返す）
  */
  const FORM = ['michi', 'michi', 'michi', 'michi', 'age', 'age', 'yama', 'yama', 'nuke', 'renda', 'nage', 'nage'];
  const FORM_CH = [C.Em11, C.Em11, C.Cmaj9, C.D6s2, C.Am11, C.Bm11, C.EmHi, C.D69, C.Cm7s, C.Bm11, C.Em11, C.D6s2];
  const SEC_BPM = { michi: 124, age: 128, yama: 132, nuke: 124, renda: 126, nage: 130 };
  /* パッドの明るさ（carry の plp に掛ける） */
  const SEC_PLP = { michi: 1, age: 1.3, yama: 2.1, nuke: 1.7, renda: 0.9, nage: 1.5 };
  /* 太鼓の強さ */
  const SEC_V = { michi: 0.85, age: 0.95, yama: 1.1, nage: 1.05 };

  /*
    太鼓と鉦の型（16分×16）
    締太鼓 X 強・x 普通・o 弱い　大胴 D 強いドン・d ドン・k 軽いコ　鉦 C チャン（開く）・k チキ（押さえる）
  */
  const PAT = {
    michi: { s1: 'X.x.X.x.X.x.X.xo', s2: '..o.x.xx..o.x.x.', od: 'D.......d..k....', kn: 'C.k.C.k.C.k.C.k.' },
    age:   { s1: 'X.xxX.x.X.xxX.xo', s2: '.o..x.xx.o..x.xo', od: 'D.....k.d.....kk', kn: 'C.kkC.k.C.kkC.k.' },
    yama:  { s1: 'X.xxX.xxX.xxX.xx', s2: '..xx..xX..xx.xxx', od: 'D...d.k.D..dD.kk', kn: 'CkkkCk.kCkkkCkkk' },
    /* 投げ合い：前半は笛が投げ（太鼓は控える）、後半は太鼓が返す */
    nage:  { s1: 'X...x...XxxxXxXx', s2: '......o.xXxXxXxX', od: '........D..dD.D.', kn: 'C...C...CkCkCkCk' }
  };
  /* 2人目の締太鼓の型を2つずらした変奏（奇数周目に使う） */
  for (const k in PAT) { const s = PAT[k].s2; PAT[k].alt2 = s.slice(14) + s.slice(0, 14); }
  const SHV = { X: 1, x: 0.7, o: 0.38 };
  const ODV = { D: 1, d: 0.75, k: 0.45 };

  /* 低音の打ち込み（根音からの半音数。null は休み） */
  const BASS_LITE = [0, null, null, null, null, null, 12, null, 0, null, null, null, null, null, 12, null];
  const BASS_DRIVE = [0, null, 12, null, 0, null, 12, 7, 0, null, 12, null, 0, 12, null, 7];

  /* A の鈴の繰り返し：夜は7つ、夜明けは6つ。4拍子と周期をずらす（A と同じ） */
  const BELL_NIGHT = [88, 83, 86, 81, 83, 79, 81];
  const BELL_DAWN = [86, 91, 88, 83, 86, 81];

  /*
    篠笛の主題（2小節＝16分32個で1句。[始まり, 長さ, 音]）。新しく書いた。
    問い：ラ・シ・レと駆け上がって、ミで張り、ラへ戻る。答え：同じ出だしで G6 まで上がり、ミ（主音）に落ちる。
  */
  const TH_A = [[0, 2, 81], [2, 2, 83], [4, 4, 86], [8, 2, 83], [10, 2, 86], [12, 4, 88], [16, 2, 86], [18, 2, 83], [20, 2, 81], [22, 2, 79], [24, 6, 81]];
  const TH_B = [[0, 2, 81], [2, 2, 83], [4, 4, 86], [8, 2, 88], [10, 2, 91], [12, 4, 88], [16, 2, 86], [18, 1, 88], [19, 1, 86], [20, 4, 83], [24, 6, 76]];
  /* 答えの変奏（3周に1回） */
  const TH_B2 = [[0, 2, 81], [2, 2, 83], [4, 4, 86], [8, 2, 88], [10, 2, 86], [12, 2, 88], [14, 2, 91], [16, 4, 88], [20, 2, 86], [22, 2, 83], [24, 6, 76]];
  /* 山の別の形（奇数周目）：答えを高い所で */
  const YAMA_B = [[0, 2, 93], [2, 2, 95], [4, 4, 98], [8, 2, 95], [10, 2, 93], [12, 4, 95], [16, 2, 93], [18, 1, 95], [19, 1, 93], [20, 4, 91], [24, 6, 88]];
  /* 抜け：高いシを長く吹いて、ミへ降りる */
  const NUKE = [[0, 10, 95], [10, 2, 93], [12, 4, 88]];
  /* 投げ合い：前半だけ吹き、後半は太鼓に返す */
  const NAGE = [[0, 2, 93], [2, 2, 91], [4, 4, 88], [16, 2, 91], [18, 2, 93], [20, 4, 95]];
  /* 夜明け：同じ形を、ソが中心になるよう1つ上の音から */
  const TD_A = [[0, 2, 83], [2, 2, 86], [4, 4, 88], [8, 2, 86], [10, 2, 88], [12, 4, 91], [16, 2, 88], [18, 2, 86], [20, 2, 83], [22, 2, 81], [24, 6, 79]];
  const TD_B = [[0, 2, 83], [2, 2, 86], [4, 4, 88], [8, 2, 91], [10, 2, 93], [12, 4, 91], [16, 2, 88], [18, 2, 86], [20, 4, 83], [24, 8, 79]];

  /* ================= 2. 小道具 ================= */

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  /* 種を固定したハッシュ乱数：同じ (a, b) なら必ず同じ値（0〜1） */
  function hrand(a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + SEED) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function smooth(a, b, x) {
    const k = clamp((x - a) / (b - a), 0, 1);
    return k * k * (3 - 2 * k);
  }
  /* 音階の上下の隣の音（当たり・打ち指に使う） */
  function upperN(m) {
    for (let k = m + 1; k < m + 5; k++) if (PC.indexOf(k % 12) >= 0) return k;
    return m + 2;
  }
  function lowerN(m) {
    for (let k = m - 1; k > m - 5; k--) if (PC.indexOf(((k % 12) + 12) % 12) >= 0) return k;
    return m - 2;
  }
  /* 音階の上で k 段ずらす（主題を「上げ」で4度上に移す） */
  function shiftDeg(list, k) {
    return list.map(function (e) {
      let m = e[2], d = 0;
      while (d < k) { m = upperN(m); d++; }
      return [e[0], e[1], m];
    });
  }
  /* 句を16分の位置ごとの表にする。つながり（legato）・同じ音の続き（打ち指）・吹き終わり（rel）を先に決めておく */
  function phraseMap(list) {
    const a = new Array(32).fill(null);
    for (let i = 0; i < list.length; i++) {
      const e = list[i], p = list[i - 1], nx = list[i + 1];
      const leg = !!(p && p[0] + p[1] === e[0]);
      a[e[0]] = { len: e[1], m: e[2], leg: leg, uchi: leg && p[2] === e[2], rel: !(nx && nx[0] === e[0] + e[1]) };
    }
    return a;
  }
  function G(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function BQ(type, f, q, gain) {
    const b = ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q || 0.7;
    if (gain !== undefined) b.gain.value = gain;
    return b;
  }
  function PAN(p) {
    if (ctx.createStereoPanner) { const s = ctx.createStereoPanner(); s.pan.value = p; return s; }
    return G(1);
  }
  function send(from, to, v) { const g = G(v); from.connect(g); g.connect(to); return g; }
  /* その時刻より後の予定を消してから動かす */
  function hold(param, t) {
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t); else param.cancelScheduledValues(t);
  }

  const PH = {
    thA: phraseMap(TH_A), thB: phraseMap(TH_B), thB2: phraseMap(TH_B2),
    up: phraseMap(shiftDeg(TH_A, 2)), yamaA: phraseMap(shiftDeg(TH_A, 5)), yamaB: phraseMap(YAMA_B),
    nuke: phraseMap(NUKE), nage: phraseMap(NAGE), tdA: phraseMap(TD_A), tdB: phraseMap(TD_B)
  };

  /* ================= 3. 起動時に1回だけ作るもの ================= */

  const rng = mulberry(SEED);
  const noise = ctx.createBuffer(1, SR * 2, SR);
  {
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rng() * 2 - 1;
  }

  /*
    残響のインパルス。gated＝true は YMO のゲートリバーブ（短く平らで、すっと切れる）。
    cut を渡すと、sec 秒の減り方（A と同じ形）のまま cut 秒で打ち切る（後ろの −38dB より小さい所を切って、計算を軽くする）
  */
  function makeIR(sec, gated, cut) {
    const n = Math.floor(SR * (cut || sec)), nn = Math.floor(SR * sec), b = ctx.createBuffer(2, n, SR);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const k = i / nn;
        const env = gated ? (k < 0.85 ? 1 : (1 - k) / 0.15) : Math.pow(1 - k, 2.2) * Math.exp(-3 * k);
        const c = gated ? 0.6 : 0.2 + 0.7 * (1 - k);
        lp += ((rng() * 2 - 1) - lp) * c;
        d[i] = lp * env;
      }
      /* 打ち切る所は 50 ミリ秒で消す */
      if (cut) { const f = Math.floor(SR * 0.05); for (let i = 0; i < f; i++) d[n - 1 - i] *= i / f; }
    }
    return b;
  }

  /* 出口：合計 → 低い所を空ける → 掛け声の帯域を少し削る → 音量 → 割れ止め（−3dBFS を超えない） */
  const sum = G(1);
  const hp = BQ('highpass', 110, 0.7);
  const carve = BQ('peaking', 1400, 0.8, -4);
  const master = G(MASTER);
  const pre = G(0.5);
  const shaper = ctx.createWaveShaper();
  {
    /* 0.55 までは素通し。それを超えた所だけ丸めて、最大でも 0.68（約 −3.3dBFS）で止める */
    const N = 4097, c = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const v = (i / (N - 1) * 2 - 1) * 2, a = Math.abs(v);
      c[i] = a <= 0.55 ? v : Math.sign(v) * (0.55 + 0.13 * Math.tanh((a - 0.55) / 0.13));
    }
    shaper.curve = c;
    shaper.oversample = 'none';
  }
  sum.connect(hp); hp.connect(carve); carve.connect(master); master.connect(pre); pre.connect(shaper); shaper.connect(dest);

  /* 残響（長い）・ゲートリバーブ（短い）・付点8分のディレイ */
  const rev = ctx.createConvolver();
  rev.buffer = makeIR(2.2, false, 1.5);
  const revIn = G(0.5), revOut = G(0.7);
  revIn.connect(rev); rev.connect(revOut); revOut.connect(sum);

  const gate = ctx.createConvolver();
  gate.buffer = makeIR(0.2, true);
  const gateIn = G(1), gateOut = G(0.45);
  gateIn.connect(gate); gate.connect(gateOut); gateOut.connect(sum);

  const dly = ctx.createDelay(2);
  dly.delayTime.value = 0.75 * 60 / BPM.idle;
  const dlyIn = G(1), dlyFb = G(0.3), dlyLP = BQ('lowpass', 2400, 0.5), dlyOut = G(0.38), dlyPan = PAN(-0.3);
  dlyIn.connect(dly); dly.connect(dlyLP); dlyLP.connect(dlyFb); dlyFb.connect(dly);
  dlyLP.connect(dlyOut); dlyOut.connect(dlyPan); dlyPan.connect(sum);

  /* 層ごとの音量のつまみ（場面と重さで動かす） */
  const B = {};
  for (const k of LAYERS) B[k] = G(0);
  B.fx = G(1);

  /* パッド：鳴らし続ける5声 → 和音の大きさ（padVca）→ ローパス */
  const padVca = G(0);
  const padLP = BQ('lowpass', MIX.idle.plp, 0.6);
  padVca.connect(padLP); padLP.connect(B.pad);
  B.pad.connect(sum);
  send(B.pad, revIn, 0.5);

  B.pluck.connect(sum);
  send(B.pluck, revIn, 0.35);
  send(B.pluck, dlyIn, 0.35);

  const bellPan = PAN(0.28);
  B.bell.connect(bellPan); bellPan.connect(sum);
  send(B.bell, revIn, 0.55);
  send(B.bell, dlyIn, 0.28);

  B.bass.connect(sum);
  send(B.bass, revIn, 0.05);

  /* 太鼓と鉦：まとめて「遠さ」のローパスに通す */
  const drumLP = BQ('lowpass', MIX.idle.dlp, 0.5);
  const shimeA = PAN(-0.3), shimeB = PAN(0.3), kanePan = PAN(0.35);
  shimeA.connect(B.shime); shimeB.connect(B.shime); kanePan.connect(B.kane);
  B.shime.connect(drumLP); B.od.connect(drumLP); B.kane.connect(drumLP);
  drumLP.connect(sum);
  send(drumLP, revIn, 0.2);
  send(B.od, gateIn, 0.7);
  send(B.shime, gateIn, 0.2);

  B.fue.connect(sum);
  send(B.fue, revIn, 0.35);
  send(B.fue, dlyIn, 0.2);

  B.sho.connect(sum);
  send(B.sho, revIn, 0.6);

  B.air.connect(sum);
  send(B.air, revIn, 0.3);

  B.fx.connect(sum);
  send(B.fx, revIn, 0.5);

  const persist = [];
  const t0 = ctx.currentTime;

  /* パッドの5声（のこぎり波、声ごとに少しずつ音程をずらす）。和音が替わるときは音程だけを動かす */
  const padV = [];
  for (let i = 0; i < 5; i++) {
    const o = ctx.createOscillator();
    const det = (hrand(i, 11) - 0.5) * 14;
    o.type = 'sawtooth';
    o.frequency.value = mtof(IDLE[0].v[i]);
    o.detune.value = det;
    o.connect(padVca);
    o.start(t0);
    persist.push(o);
    padV.push({ o: o, det: det });
  }
  const PADV = 0.05;
  /* パッドの明るさをゆっくり揺らす（約14秒で一回り） */
  {
    const o = ctx.createOscillator(), g = G(200);
    o.frequency.value = 0.07;
    o.connect(g); g.connect(padLP.frequency);
    o.start(t0); persist.push(o);
  }
  /* 夜の空気：雑音を帯域通過で細くして、中心をゆっくり動かす（A と同じ） */
  {
    const s = ctx.createBufferSource();
    s.buffer = noise; s.loop = true; s.playbackRate.value = 0.93;
    const bp = BQ('bandpass', 2400, 0.5), g = G(0.05);
    const o = ctx.createOscillator(), og = G(900);
    o.frequency.value = 0.043;
    o.connect(og); og.connect(bp.frequency);
    s.connect(bp); bp.connect(g); g.connect(B.air);
    s.start(t0); o.start(t0);
    persist.push(s, o);
  }

  /*
    篠笛（C の作り方）：1本の息で吹き続ける1声。音ごとに部品を作らず、音程と音量を動かす。
    開管なので全部の倍音があり上ほど弱い波形。息は、音程のまわりの帯域通過の雑音と、吹き口の「スー」（高い所の雑音）。
  */
  const F = {};
  {
    const amps = [0, 1, 0.38, 0.2, 0.11, 0.06, 0.035, 0.02, 0.012];
    F.osc = ctx.createOscillator();
    F.osc.setPeriodicWave(ctx.createPeriodicWave(new Float32Array(amps.length), new Float32Array(amps)));
    F.osc.frequency.value = 880;
    F.amp = G(0); F.trem = G(1); F.lp = BQ('lowpass', 4000, 0.4);
    F.osc.connect(F.amp); F.amp.connect(F.trem); F.trem.connect(F.lp); F.lp.connect(B.fue);
    F.noise = ctx.createBufferSource(); F.noise.buffer = noise; F.noise.loop = true;
    F.bp = BQ('bandpass', 880, 2.2); F.hp = BQ('highpass', 5500, 0.7); F.airG = G(0.25); F.breath = G(0);
    F.noise.connect(F.bp); F.bp.connect(F.breath);
    F.noise.connect(F.hp); F.hp.connect(F.airG); F.airG.connect(F.breath);
    F.breath.connect(B.fue);
    /* ビブラート（長い音だけ遅れてかける）、ゆっくりした音程のゆらぎ、音量の揺れ */
    F.vibL = ctx.createOscillator(); F.vibL.frequency.value = 5.2; F.vib = G(0);
    F.vibL.connect(F.vib); F.vib.connect(F.osc.frequency);
    F.drL = ctx.createOscillator(); F.drL.frequency.value = 0.29; F.dr = G(2.5);
    F.drL.connect(F.dr); F.dr.connect(F.osc.frequency);
    F.trL = ctx.createOscillator(); F.trL.frequency.value = 4.3; F.tr = G(0.06);
    F.trL.connect(F.tr); F.tr.connect(F.trem.gain);
    for (const s of [F.osc, F.noise, F.vibL, F.drL, F.trL]) { s.start(t0); persist.push(s); }
    F.f = 0; F.lvl = 0; F.end = -1; F.fresh = true;
  }

  /* ================= 4. 楽器 ================= */

  let nC = 0;

  /*
    打楽器（締太鼓・大胴・鉦）と鈴の音は、起動時に1回だけ作っておき、鳴らすときは再生するだけにする
    （一打ごとに発振器とフィルターを組むと重いため。ゲームの効果音と同じやり方）。
    中身の作りは、正弦波・三角波・矩形波の鳴りと、帯域を絞った雑音を、指数で減らして足し合わせる。
  */
  function bqCoef(type, f, q) {
    const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, al = Math.sin(w) / (2 * q), cw = Math.cos(w), a0 = 1 + al;
    const s = { a1: -2 * cw / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
    if (type === 'lowpass') { s.b0 = (1 - cw) / 2 / a0; s.b1 = (1 - cw) / a0; s.b2 = s.b0; }
    else { s.b0 = al / a0; s.b1 = 0; s.b2 = -al / a0; }
    return s;
  }
  function bqRun(s, x) {
    const y = s.b0 * x + s.b1 * s.x1 + s.b2 * s.x2 - s.a1 * s.y1 - s.a2 * s.y2;
    s.x2 = s.x1; s.x1 = x; s.y2 = s.y1; s.y1 = y;
    return y;
  }
  /* 0.0001 から att 秒で 1 へ上がり、dur 秒で 0.0001 まで指数で下がる（exponentialRamp と同じ形） */
  function envAt(t, att, dur) {
    if (t < att) return Math.pow(1e-4, 1 - t / att);
    return Math.exp(-9.21 * (t - att) / (dur - att));
  }
  /* 音程が f から f1 へ g 秒かけて指数で動く鳴りを足す。wave：0 正弦・1 三角・2 矩形（奇数倍音を7倍まで） */
  function addTone(d, f, f1, g, amp, dur, wave, att) {
    let ph = 0;
    const n = Math.min(d.length, Math.ceil(dur * SR));
    for (let i = 0; i < n; i++) {
      const t = i / SR, fr = t < g ? f * Math.pow(f1 / f, t / g) : f1;
      ph += 2 * Math.PI * fr / SR;
      let v;
      if (wave === 1) v = 2 / Math.PI * Math.asin(Math.sin(ph));
      else if (wave === 2) v = 0.8 * (Math.sin(ph) + Math.sin(3 * ph) / 3 + Math.sin(5 * ph) / 5 + Math.sin(7 * ph) / 7);
      else v = Math.sin(ph);
      d[i] += v * amp * envAt(t, att, dur);
    }
  }
  /* 帯域を絞った雑音を足す（フィルターを通してから減らす） */
  function addNoise(d, type, f, q, amp, dur, r) {
    const s = bqCoef(type, f, q), n = Math.min(d.length, Math.ceil(dur * SR));
    for (let i = 0; i < n; i++) d[i] += bqRun(s, r() * 2 - 1) * amp * envAt(i / SR, 0.0015, dur);
  }
  function mkBuf(sec, fill) {
    const b = ctx.createBuffer(1, Math.ceil(SR * sec), SR);
    fill(b.getChannelData(0));
    return b;
  }

  /*
    締太鼓：C の本物寄りの皮の鳴り（一瞬高く入ってすぐ落ちる）を三角波にして硬い皮の上の鳴りを兼ね、
    A のクラベスのような乾いた短さ（0.09秒）にした。撥の「カッ」は 3.2kHz の帯域の雑音。2人目は少し高い。
    大胴（大太鼓）：C の作り（上から落ちてくる胴の鳴り＋胴の上の鳴り＋皮の雑音）。
    足音とドン（40〜120Hz）にぶつからないよう基音を 108Hz に置いて 0.6秒で切り、胴の上の鳴り（約290Hz）で太鼓らしさを出す。A のゲートリバーブに送る。
    鉦（当たり鉦・摺り鉦）：真鍮の皿を撞木で打つ「チャン」と、押さえた「チキ」。
    澄んで響き続ける音にしない：主役は高い帯域の雑音（擦れ）。金属の鳴りは矩形波1つ（奇数倍音が不協和に混ざる）で、25〜70 ミリ秒で消す。
    それぞれ高さと雑音を少しずつ変えた3通りを作り、打つたびに選ぶ。
  */
  const DR = { shime: [[], []], don: [], ko: [], chan: [], chiki: [] };
  {
    const r = mulberry(SEED ^ 0x5eed);
    for (let v = 0; v < 3; v++) {
      for (let side = 0; side < 2; side++) {
        const f0 = (side ? 498 : 432) * (1 + (r() - 0.5) * 0.012);
        DR.shime[side].push(mkBuf(0.1, function (d) {
          addTone(d, f0 * 1.4, f0, 0.045, 0.24, 0.09, 1, 0.0015);
          addNoise(d, 'bandpass', 3200, 0.9, 0.32, 0.035, r);
        }));
      }
      for (const don of [true, false]) {
        const f0 = 108 * (1 + (r() - 0.5) * 0.02), dur = don ? 0.6 : 0.28, bd = don ? 0.26 : 0.13;
        (don ? DR.don : DR.ko).push(mkBuf(dur + 0.01, function (d) {
          let ph = 0;
          const n = Math.ceil(dur * SR);
          for (let i = 0; i < n; i++) {
            const t = i / SR;
            const fr = t < 0.05 ? f0 * Math.pow(1.7, 1 - t / 0.05) : f0 * Math.pow(0.94, Math.min(1, (t - 0.05) / 0.45));
            ph += 2 * Math.PI * fr / SR;
            d[i] += Math.sin(ph) * 0.5 * envAt(t, 0.004, dur);
          }
          addTone(d, f0 * 2.7, f0 * 2.45, Math.min(0.05, bd * 0.5), 0.26, bd, 0, 0.0015);
          addNoise(d, 'lowpass', don ? 900 : 1200, 0.7, 0.32, 0.07, r);
        }));
      }
      for (const open of [true, false]) {
        const base = 3050 * (1 + (r() - 0.5) * 0.012), dur = open ? 0.07 : 0.025;
        (open ? DR.chan : DR.chiki).push(mkBuf(0.075, function (d) {
          addNoise(d, 'bandpass', open ? 5200 : 6400, 1.1, 0.2, open ? 0.06 : 0.025, r);
          addTone(d, base, base * 0.985, Math.min(0.05, dur * 0.5), 0.05, dur, 2, 0.0015);
        }));
      }
    }
  }
  function playBuf(t, buf, vel, out) {
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf;
    g.gain.value = vel;
    s.connect(g); g.connect(out);
    s.start(t);
  }
  /* side＝1 は2人目（右、少し高い） */
  function shimeHit(t, vel, side) {
    if (vel < 0.01) return;
    playBuf(t, DR.shime[side ? 1 : 0][Math.floor(hrand(nC++, 21) * 3)], Math.min(1.2, vel), side ? shimeB : shimeA);
  }
  function odaiko(t, vel, kind) {
    if (vel < 0.01) return;
    playBuf(t, (kind === 'ko' ? DR.ko : DR.don)[Math.floor(hrand(nC++, 22) * 3)], vel, B.od);
  }
  function kaneHit(t, vel, open) {
    if (vel < 0.01) return;
    playBuf(t, (open ? DR.chan : DR.chiki)[Math.floor(hrand(nC++, 23) * 3)], vel, kanePan);
  }

  /*
    低音：A の打ち込みのシンセベース（のこぎり波＋閉じていく共振ローパス）。
    低音は1声なので、共振ローパスは1つだけ作り、音ごとに開いて閉じる（音ごとにフィルターを作るより軽い）。
  */
  const bassF = BQ('lowpass', 320, 5);
  bassF.connect(B.bass);
  function bass(t, midi, vel, len) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    bassF.frequency.setValueAtTime(2200, t);
    bassF.frequency.exponentialRampToValueAtTime(320, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.08);
    o.connect(g); g.connect(bassF);
    o.start(t); o.stop(t + len + 0.1);
  }

  /*
    はじく音：のこぎり波を、共通の1つのローパス（pluckLP）でこもらせた短い音。
    音ごとにフィルターを作って動かすと重いので、フィルターは1つだけにして、音量の減り方ではじく感じを出す。
  */
  const pluckLP = BQ('lowpass', 1500, 0.8);
  pluckLP.connect(B.pluck);
  function pluck(t, midi, vel, len) {
    if (vel < 0.01) return;
    const f = mtof(midi), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = (hrand(nC++, 24) - 0.5) * 8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.085 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.03 * vel, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(pluckLP);
    o.start(t); o.stop(t + len + 0.02);
  }

  /*
    鈴（A のガムランふうのベル）：FM 変調比 2.76。5.5Hz ずらした音を重ねて、ガムランの対の楽器のようにうならせる（A と同じ作り）。
    音の高さごとに2秒ぶんを初めて使うときに1回だけ作り、あとは再生するだけ。短く鳴らすときは、音量の減りを足して同じ長さで消す。
  */
  const BELL_LEN = 2.0;
  const bellCache = {};
  /*
    10/23 ゲームに入れたとき：1つの高さを作るのにスマホ相当で 60〜100ms かかり、選ぶ画面で鈴が新しい高さを鳴らすたびに画面が止まったので、
    作る処理を「途中から続けられる形」にした。prepare() で鳴る前に少しずつ作っておき、まだできていない高さを鳴らすときは残りをその場で作る。
    1つの高さを一度に作っても、分けて作っても、同じ式を同じ順に通すので中身は同じ。
  */
  const BELL_ALL = [];
  /* 先に鳴る順：選ぶ画面の高さ → そのオクターブ上 → 夜明けの高さ → そのオクターブ上 */
  const up12 = function (m) { return m + 12; };
  for (const k of BELL_NIGHT.concat(BELL_NIGHT.map(up12), BELL_DAWN, BELL_DAWN.map(up12))) if (BELL_ALL.indexOf(k) < 0) BELL_ALL.push(k);
  const bellJob = {};
  function bellRun(midi, upto) {
    let j = bellJob[midi];
    if (!j) {
      const f = mtof(midi), n = Math.ceil(SR * BELL_LEN), b = ctx.createBuffer(1, n, SR);
      j = bellJob[midi] = { f: f, n: n, b: b, d: b.getChannelData(0), i: 0, pc: 0, wm: 2 * Math.PI * f * 2.76 / SR, kI: Math.log(25) / (BELL_LEN * 0.5) };
    }
    /*
      式は前と同じ（変調の深さ dev は exp で減り、鳴りの大きさは envAt）。軽くするため、一定の割合で減る exp と、一定の速さで回る sin（変調の sin(pm)、
      うなりの sin(po)）は、1点ごとに掛け算で進め、256点ごと（と立ち上がりの 200点）は正確な値で合わせ直す。変わるのは計算の丸めの桁だけ
    */
    const f = j.f, d = j.d, end = Math.min(j.n, upto), wm = j.wm, wo = 2 * Math.PI * (f + 5.5) / SR, HALF = BELL_LEN * 0.5;
    const k1 = Math.exp(-9.21 / ((BELL_LEN - 0.002) * SR)), k2 = Math.exp(-9.21 / ((BELL_LEN * 0.9 - 0.004) * SR)), kd = Math.exp(-j.kI / SR);
    const cwm = Math.cos(wm), swm = Math.sin(wm), cwo = Math.cos(wo), swo = Math.sin(wo);
    let pc = j.pc, i = j.i, e1 = 0, e2 = 0, de = 0, sm = 0, cm = 1, so = 0, co = 1, first = true;
    for (; i < end; i++) {
      const t = i / SR;
      if (first || i < 200 || (i & 255) === 0) {
        first = false;
        e1 = envAt(t, 0.002, BELL_LEN); e2 = envAt(t, 0.004, BELL_LEN * 0.9); de = Math.exp(-j.kI * t);
        sm = Math.sin((i + 1) * wm); cm = Math.cos((i + 1) * wm); so = Math.sin((i + 1) * wo); co = Math.cos((i + 1) * wo);
      } else {
        e1 *= k1; e2 *= k2; de *= kd;
        let a = sm * cwm + cm * swm; cm = cm * cwm - sm * swm; sm = a;
        a = so * cwo + co * swo; co = co * cwo - so * swo; so = a;
      }
      const dev = f * 1.1 * (t < HALF ? de : 0.04);
      pc += 2 * Math.PI * (f + dev * sm) / SR;
      d[i] = 0.1 * Math.sin(pc) * e1 + 0.045 * so * e2;
    }
    j.pc = pc; j.i = i;
    if (i >= j.n) { bellCache[midi] = j.b; delete bellJob[midi]; }
  }
  function bellBuf(midi) {
    if (!bellCache[midi]) bellRun(midi, Infinity);
    return bellCache[midi];
  }
  /* 鈴を先に少しずつ作る（1回に約 sec 秒ぶんの音）。全部できたら false を返す */
  function bellPrepare(sec) {
    let left = Math.ceil(SR * (sec || 0.1));
    for (const m of BELL_ALL) {
      if (bellCache[m]) continue;
      const j0 = bellJob[m] ? bellJob[m].i : 0;
      bellRun(m, j0 + left);
      left -= (bellCache[m] ? Math.ceil(SR * BELL_LEN) : bellJob[m].i) - j0;
      if (left <= 0) return true;
    }
    return BELL_ALL.some(function (m) { return !bellCache[m]; });
  }
  function bell(t, midi, vel, dur) {
    if (vel < 0.01) return;
    const s = ctx.createBufferSource(), g = ctx.createGain(), L = Math.min(dur, BELL_LEN);
    s.buffer = bellBuf(midi);
    g.gain.setValueAtTime(vel, t);
    if (L < BELL_LEN - 0.01) g.gain.exponentialRampToValueAtTime(vel * Math.exp(-9.21 * (1 - L / BELL_LEN)), t + L);
    s.connect(g); g.connect(B.bell);
    s.start(t); s.stop(t + L + 0.03);
  }

  /* 篠笛の1音。e：{len, m, leg, uchi, rel}、d：長さ（秒）、grace：当たり（上の音から入る）の音 */
  function fueNote(t, e, d, vel, grace) {
    const m = e.m, f = mtof(m), kan = m >= 86;
    const fresh = F.fresh || t > F.end + 0.02;
    F.fresh = false;
    const legato = e.leg && !fresh, uchi = e.uchi && !fresh;
    const lvl = 0.13 * vel * (0.88 + 0.12 * clamp((m - 74) / 19, 0, 1));
    /* 呂（低いオクターブ）は息が多く、甲（高いオクターブ）は息が少なく明るい */
    const br = (kan ? 1.0 : 1.5) * lvl;
    const fq = F.osc.frequency, amp = F.amp.gain, be = F.breath.gain;
    F.lp.frequency.setValueAtTime(f * (kan ? 6 : 3.8), t);
    F.bp.frequency.setValueAtTime(f, t);
    if (grace) {
      fq.setValueAtTime(mtof(grace), t);
      fq.setValueAtTime(f * 0.992, t + 0.045);
      fq.exponentialRampToValueAtTime(f, t + 0.075);
    } else if (uchi) {
      /* 打ち指：同じ音が続くとき、指で穴を一瞬たたいて切る（一瞬だけ下の音が出る） */
      fq.setValueAtTime(mtof(lowerN(m)), t);
      fq.setValueAtTime(f, t + 0.024);
    } else if (legato) {
      fq.setValueAtTime(F.f || f, t);
      fq.exponentialRampToValueAtTime(f, t + 0.025);
    } else {
      /* 吹き始めは少し低く入って本来の高さへ上がる */
      fq.setValueAtTime(f * 0.955, t);
      fq.exponentialRampToValueAtTime(f, t + 0.07);
    }
    if (uchi) {
      amp.setValueAtTime(lvl * 0.45, t); amp.linearRampToValueAtTime(lvl, t + 0.035);
      be.setValueAtTime(br * 1.8, t); be.linearRampToValueAtTime(br, t + 0.05);
    } else if (legato) {
      amp.setValueAtTime(F.lvl || lvl, t); amp.linearRampToValueAtTime(lvl, t + 0.03);
      be.setValueAtTime(br * 1.3, t); be.linearRampToValueAtTime(br, t + 0.05);
    } else {
      amp.setValueAtTime(0.0001, t); amp.linearRampToValueAtTime(lvl, t + 0.035);
      be.setValueAtTime(0.0001, t); be.linearRampToValueAtTime(br * 2.6, t + 0.012); be.linearRampToValueAtTime(br, t + 0.09);
    }
    if (d > 0.5) amp.linearRampToValueAtTime(lvl * 1.08, t + d * 0.8);
    F.vib.gain.setValueAtTime(0, t);
    if (d > 0.42) {
      F.vib.gain.setValueAtTime(0, t + 0.22);
      F.vib.gain.linearRampToValueAtTime(f * 0.0075, t + Math.min(0.7, d * 0.7));
    }
    if (e.rel) {
      const tr = Math.max(t + d - 0.05, t + 0.1);
      amp.setTargetAtTime(0.0001, tr, 0.03);
      be.setTargetAtTime(0.0001, tr, 0.025);
      if (d > 0.3) { fq.setValueAtTime(f, tr); fq.exponentialRampToValueAtTime(f * 0.985, t + d - 0.005); }
      F.end = t + d;
    } else {
      F.end = t + d + 30;
    }
    F.f = f; F.lvl = lvl;
  }
  function fueSilence(T) {
    hold(F.amp.gain, T); F.amp.gain.setTargetAtTime(0.0001, T, 0.03);
    hold(F.breath.gain, T); F.breath.gain.setTargetAtTime(0, T, 0.03);
    hold(F.vib.gain, T); F.vib.gain.setTargetAtTime(0, T, 0.05);
    F.fresh = true; F.end = T;
  }
  /* ヒシギ（魂振り）：高い音の細かい行き来 */
  function fueTrill(t, a, b, dur, vel) {
    fueNote(t, { len: 0, m: a, leg: false, uchi: false, rel: true }, dur, vel, 0);
    F.vib.gain.setValueAtTime(0, t);
    const fa = mtof(a), fb = mtof(b), fq = F.osc.frequency;
    let k = 0;
    for (let x = t + 0.28; x < t + dur - 0.12; x += 0.066) { fq.setValueAtTime(k % 2 ? fa : fb, x); k++; }
  }
  /* つかえた：笛が「ヒュルル」と落ちる */
  function fueDrop(T) {
    const f = clamp(F.f || mtof(81), 700, 1500), fq = F.osc.frequency, amp = F.amp.gain, be = F.breath.gain;
    hold(fq, T); hold(amp, T); hold(be, T); hold(F.vib.gain, T); hold(F.bp.frequency, T);
    fq.setValueAtTime(f * 1.06, T);
    fq.exponentialRampToValueAtTime(f, T + 0.06);
    fq.exponentialRampToValueAtTime(f * 0.42, T + 0.62);
    F.bp.frequency.setValueAtTime(f, T);
    F.bp.frequency.exponentialRampToValueAtTime(f * 0.42, T + 0.62);
    F.vib.gain.setValueAtTime(0, T);
    F.vib.gain.linearRampToValueAtTime(f * 0.025, T + 0.35);
    amp.setValueAtTime(0.0001, T);
    amp.linearRampToValueAtTime(0.1, T + 0.03);
    amp.setTargetAtTime(0.0001, T + 0.42, 0.08);
    be.setValueAtTime(0.0001, T);
    be.linearRampToValueAtTime(0.14, T + 0.02);
    be.setTargetAtTime(0, T + 0.4, 0.08);
    F.vib.gain.setValueAtTime(0, T + 0.9);
    F.fresh = true; F.end = T;
  }

  /* パッド：和音（5声の音程）を替える */
  function padChord(t, ch, tau) {
    for (let i = 0; i < 5; i++) padV[i].o.frequency.setTargetAtTime(mtof(ch.v[i]), t, tau || 0.02);
  }
  function padLevel(t, v, tau) {
    hold(padVca.gain, t);
    padVca.gain.setTargetAtTime(v, t, tau);
  }
  /* つかえた：パッドの音程を落としながら消し（テープが止まるような、ずっこけ。A の作り）、少し後で低く戻す */
  function bendPad(T) {
    for (const v of padV) {
      hold(v.o.detune, T);
      v.o.detune.setValueAtTime(v.det, T);
      v.o.detune.linearRampToValueAtTime(v.det - 380, T + 0.75);
      v.o.detune.setValueAtTime(v.det, T + 1.6);
    }
    hold(padVca.gain, T);
    padVca.gain.setTargetAtTime(0, T + 0.15, 0.22);
    padChord(T + 1.5, C.Em9, 0.01);
    padVca.gain.setTargetAtTime(PADV * 0.7, T + 1.7, 0.8);
  }

  /* 笙のような和音（お祓い）：のこぎり波をこもらせたリードの音。掛け声と手締めの帯域より低く置く */
  let shoVoices = [];
  const SHO = [64, 66, 69, 71, 74, 76];
  const shoLP = BQ('lowpass', 1300, 0.6);
  shoLP.connect(B.sho);
  function shoStart(t) {
    for (let i = 0; i < SHO.length; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = mtof(SHO[i]);
      o.detune.value = (hrand(i, 31) - 0.5) * 10;
      g.gain.setValueAtTime(0, t);
      g.gain.setTargetAtTime(0.02, t, 0.9);
      /* お祓いは約5.9秒（10/23 大麻を外して8秒から詰めた）。途中で止まって聞こえないよう、3秒あたりで F#4 だけを G4 へゆっくり動かす（前は4秒） */
      if (i === 1) o.frequency.setTargetAtTime(mtof(67), t + 3, 0.8);
      o.connect(g); g.connect(shoLP);
      o.start(t); o.stop(t + 60);
      shoVoices.push({ o: o, g: g });
    }
  }
  function shoStop(t) {
    for (const v of shoVoices) {
      hold(v.g.gain, t);
      v.g.gain.setTargetAtTime(0, t, 0.3);
      try { v.o.stop(t + 2); } catch (e) { /* 止める時刻を決め直せない環境では、最初の予定で止まる */ }
    }
    shoVoices = [];
  }

  /* つかえた瞬間：パッドが落ち、笛が落ち、締太鼓が「テ・ケ」とずっこける */
  function zukkoke(T) {
    /* ぶつかった「ドン」（ゲームの効果音）と曲の山が重なって割れないよう、つかえた瞬間だけ曲全体を一瞬絞って、0.25秒後から戻す */
    hold(master.gain, T);
    master.gain.setTargetAtTime(MASTER * 0.25, T, 0.006);
    master.gain.setTargetAtTime(MASTER, T + 0.25, 0.12);
    bendPad(T);
    fueDrop(T);
    shimeHit(T + 0.66, 0.35, 1);
    shimeHit(T + 0.74, 0.5, 0);
  }

  /* ================= 5. 場面と重さ ================= */

  const S = {
    scene: 'idle', x: 0.5, bpm: BPM.idle, bpmT: BPM.idle, dlyBpm: BPM.idle,
    n: 0, next: null, q: [], qx: [], started: false, applied: false, stopAt: Infinity, sceneT: 0,
    fb: -1, cyc: 0, lead: 0, leadTotal: 1, resumeTo: 0, ib: -1, bb: -1, fueNeed: false
  };

  function layerGain(sc, name, x) {
    let g = MIX[sc][name];
    if (sc === 'carry') {
      if (name === 'bass') g *= 0.55 + 0.45 * x;
      else if (name === 'od') g *= 0.6 + 0.4 * x;
      else if (name === 'kane') g *= 0.6 + 0.4 * x;
      else if (name === 'pad') g *= 1.1 - 0.3 * x;
    }
    return g;
  }
  function setLayers(t, tc) {
    for (const k of LAYERS) { hold(B[k].gain, t); B[k].gain.setTargetAtTime(layerGain(S.scene, k, S.x), t, tc); }
  }

  function applyScene(name, t, s) {
    const prev = S.scene;
    S.scene = name;
    S.sceneT = t;
    S.applied = true;
    S.bpmT = BPM[name];
    const m = MIX[name], fast = name === 'stuck';
    hold(padLP.frequency, t);
    if (prev === 'harai' && name !== 'harai') shoStop(t);
    /* 約1〜2秒でなめらかに移る（つかえたときだけ即座。お祓いは太鼓を早めに引いて効果音を立てる） */
    let tc = 0.45;
    if (fast) tc = 0.025;
    else if (name === 'harai') tc = 0.2;
    else if (name === 'tamafuri') tc = 0.06;
    setLayers(t, tc);
    hold(revIn.gain, t);
    revIn.gain.setTargetAtTime(m.rev, t, fast ? 0.1 : 0.5);
    hold(drumLP.frequency, t);
    drumLP.frequency.setTargetAtTime(m.dlp, t, 0.4);
    padLP.frequency.setTargetAtTime(m.plp, t, 0.5);

    if (name === 'stuck') { zukkoke(t); return; }
    if (prev === 'stuck') {
      /* つかえた後の予約（パッドの戻り）を消してから、新しい場面の大きさにする */
      for (const v of padV) { hold(v.o.detune, t); v.o.detune.setValueAtTime(v.det, t); }
    }
    if (name === 'idle') {
      S.ib = -1;
      padLevel(t, PADV, 0.8);
    } else if (name === 'carry') {
      /* 締太鼓の連打で入る。小節の残りが短いときは、もう1小節たたく。つかえた後は「上げ」から続ける */
      const rem = 16 - s;
      S.lead = rem < 8 ? rem + 16 : rem;
      S.leadTotal = S.lead;
      S.resumeTo = prev === 'stuck' ? 4 : 0;
      padChord(t, C.Bm11, 0.05);
      padLevel(t, PADV * 1.4, 0.3);
      if (prev !== 'stuck') fueSilence(t);
    } else if (name === 'harai') {
      fueSilence(t);
      padChord(t, C.HARAI, 0.4);
      padLevel(t, PADV, 0.6);
      shoStart(t);
    } else if (name === 'tamafuri') {
      fueSilence(t);
      S.bpm = BPM.tamafuri;
      padChord(t, C.TAMA, 0.01);
      padLevel(t, PADV, 0.04);
      S.fueNeed = true;
    } else if (name === 'back') {
      fueSilence(t);
      S.bb = -1;
      S.bpm = Math.min(S.bpm, 112);
      padLevel(t, PADV, 0.6);
      /* 夜明け：パッドを1分ほどかけて明るく開いていく */
      padLP.frequency.setTargetAtTime(2600, t + 2, 18);
    }
  }

  function processQueue(t, s) {
    while (S.q.length && S.q[0].t <= t + 1e-6) {
      if (S.q.length > 1 && S.q[1].t <= t + 1e-6) { S.q.shift(); continue; }
      const e = S.q[0];
      /* 拍の頭にそろえる（つかえたときだけ待たない） */
      if (e.name !== 'stuck' && s % 4 !== 0) break;
      S.q.shift();
      /* つかえたときは、指定の時刻そのもので止める（16分の頭まで待つと、ぶつかった「ドン」に曲が重なる） */
      if (e.name === 'stuck' && e.name !== S.scene) applyScene('stuck', Math.max(e.t, ctx.currentTime), s);
      else if (e.name !== S.scene || !S.applied) applyScene(e.name, t, s);
    }
    while (S.qx.length && S.qx[0].t <= t + 1e-6) {
      const e = S.qx.shift();
      if (Math.abs(e.x - S.x) > 0.01) {
        S.x = e.x;
        if (S.scene === 'carry' && S.applied) setLayers(t, 0.8);
      }
    }
  }

  function insertSorted(list, e) {
    let i = list.length;
    while (i > 0 && list[i - 1].t > e.t) i--;
    list.splice(i, 0, e);
  }

  /* ================= 6. 1歩（16分）ごとの中身 ================= */

  /* 締太鼓の連打：2人が16分を交互に。後ろほど強く、終わりのほうは32分で「ドロロロ」。left は小節の終わりまでの歩数 */
  function rendaStep(t, s, sd, tt, prog, left) {
    const v = 0.55 + 0.6 * prog;
    shimeHit(tt(0), v * (s % 4 === 0 ? 1 : 0.82), s % 2);
    if (prog > 0.6) shimeHit(tt(0) + sd * 0.5, v * 0.7, 1 - s % 2);
    if (s === 0) odaiko(tt(0.004), 0.75, 'don');
    if (left === 4 || left === 2) odaiko(tt(0.004), 0.95, 'don');
    if (s % 4 === 0) kaneHit(tt(0.008), 0.5 + 0.5 * prog, true);
    else if (prog > 0.5 && s % 2 === 0) kaneHit(tt(0.008), 0.45, false);
    if (s === 0 && S.x >= 0.35) bass(tt(-0.004), 47, 0.8, sd * 3);
  }

  function fuePlay(map, idx, t, sd, vel, ornament, n) {
    const e = map[idx];
    if (!e) return;
    const grace = (ornament && e.len >= 4 && hrand(n, 7) < 0.55) ? upperN(e.m) : 0;
    fueNote(t, e, e.len * sd, vel, grace);
  }

  function enterSection(t, sec, fb) {
    S.bpmT = SEC_BPM[sec];
    padChord(t, FORM_CH[fb]);
    hold(padLP.frequency, t);
    padLP.frequency.setTargetAtTime(MIX.carry.plp * SEC_PLP[sec], t, sec === 'nuke' ? 0.15 : 0.5);
    padLevel(t, PADV * (sec === 'nuke' ? 1.5 : 1), sec === 'nuke' ? 0.15 : 0.4);
    hold(revIn.gain, t);
    revIn.gain.setTargetAtTime(sec === 'nuke' ? 0.55 : MIX.carry.rev, t, 0.2);
  }

  /* 担いで進む */
  function stepCarry(t, n, s, sd, tt) {
    const x = S.x;
    if (S.lead > 0) {
      rendaStep(t, s, sd, tt, 1 - S.lead / S.leadTotal, S.lead);
      /* 入りの連打の間も、大胴を拍ごとに強めながら打ち、はじく音と低音で和音を鳴らしておく（締太鼓だけになって一度へこまないように） */
      const pg = 1 - S.lead / S.leadTotal;
      if (s % 4 === 0 && s !== 0 && S.lead > 4) odaiko(tt(0.004), 0.6 + 0.4 * pg, 'don');
      if (s % 2 === 0) pluck(tt(0), C.Bm11.v[1 + (s / 2) % 4] + 12, 0.85, 0.3);
      if (s % 4 === 0 && s !== 0) bass(tt(-0.004), 47, 0.9, sd * 2);
      S.lead--;
      if (S.lead === 0) S.fb = S.resumeTo - 1;
      return;
    }
    if (s === 0) {
      S.fb++;
      if (S.fb >= FORM.length) { S.fb = 0; S.cyc++; }
      enterSection(t, FORM[S.fb], S.fb);
    }
    const fb = S.fb, sec = FORM[fb], cyc = S.cyc;

    /* 抜け：最初の「ドン」だけ。あとは笛の長い音と和音（空間） */
    if (sec === 'nuke') {
      if (s === 0) { odaiko(tt(0.004), 1, 'don'); shimeHit(tt(0), 0.9, 0); shimeHit(tt(0.006), 0.9, 1); }
      if (s === 0) bass(tt(-0.004), FORM_CH[fb].root + 12, 0.7, sd * 10);
      fuePlay(PH.nuke, s, tt(0.003), sd, 1, false, n);
      return;
    }
    if (sec === 'renda') {
      rendaStep(t, s, sd, tt, s / 15, 16 - s);
      return;
    }

    const pv = PAT[sec], vs = SEC_V[sec];
    const c1 = pv.s1.charAt(s), c2 = (cyc % 2 ? pv.alt2 : pv.s2).charAt(s), co = pv.od.charAt(s), ck = pv.kn.charAt(s);
    if (c1 !== '.') shimeHit(tt(0), SHV[c1] * vs, 0);
    if (c2 !== '.') shimeHit(tt(0.006), SHV[c2] * vs * (0.45 + 0.55 * smooth(0.1, 0.5, x)), 1);
    else if (c1 === '.' && hrand(n, 1) < 0.05) shimeHit(tt(0.006), 0.22, 1);
    if (co !== '.' && !(co === 'k' && x < 0.3)) odaiko(tt(0.004), ODV[co] * vs, co === 'k' ? 'ko' : 'don');
    /* 山の終わりは大胴の「ドドン」 */
    if (sec === 'yama' && fb === 7 && (s === 13 || s === 14)) odaiko(tt(0.004), 0.9, 'don');
    if (ck !== '.') kaneHit(tt(0.009), ck === 'C' ? vs : 0.5 * vs, ck === 'C');

    /* 低音 */
    const bp = (sec === 'michi' || x < 0.35) ? BASS_LITE[s] : BASS_DRIVE[s];
    if (bp !== null && !(sec === 'nage' && s < 8 && s > 0)) bass(tt(-0.004), FORM_CH[fb].root + bp, s === 0 ? 1 : 0.75, sd * 0.9);

    /* はじく音：上げと山だけ、和音を8分で上下に（ディレイで夜の空気に溶かす） */
    if ((sec === 'age' || sec === 'yama') && s % 2 === 0) {
      const v = FORM_CH[fb].v, k = (s / 2) % 6, idx = k < 4 ? 1 + k : 7 - k;
      pluck(tt(0), v[idx] + 12, sec === 'yama' ? 0.75 : 0.55, 0.32);
    }

    /* 篠笛 */
    const idx = (fb % 2) * 16 + s;
    let map;
    if (fb <= 1) map = PH.thA;
    else if (fb <= 3) map = cyc % 3 === 2 ? PH.thB2 : PH.thB;
    else if (sec === 'age') map = PH.up;
    else if (sec === 'yama') map = cyc % 2 ? PH.yamaB : PH.yamaA;
    else map = PH.nage;
    fuePlay(map, idx, tt(0.003), sd, sec === 'yama' ? 1.08 : 1, cyc % 2 === 1, n);
  }

  /* 選ぶ画面：遠くの祭り。太鼓は風で近づいたり遠のいたりする（13小節で一回り）。8小節に1度、遠くで主題が聞こえる */
  function stepIdle(t, n, s, sd, tt) {
    if (s === 0) {
      S.ib++;
      if (S.ib % 2 === 0) padChord(t, IDLE[Math.floor(S.ib / 2) % 2], 0.3);
    }
    const bar = Math.max(0, S.ib), far = 0.55 + 0.45 * Math.sin(bar * 2 * Math.PI / 13);
    const pv = PAT.michi;
    const c1 = pv.s1.charAt(s), c2 = pv.s2.charAt(s);
    if (c1 !== '.') shimeHit(tt(0), SHV[c1] * far * 0.85, 0);
    if (c2 !== '.' && bar % 2 === 1) shimeHit(tt(0.006), SHV[c2] * far * 0.7, 1);
    if (s === 0 && bar % 2 === 0) odaiko(tt(0.004), 0.9 * far, 'don');
    if (s === 8 && bar % 4 === 1) odaiko(tt(0.004), 0.6 * far, 'don');
    if (s % 8 === 4) kaneHit(tt(0.009), 0.7 * far, true);
    /* 鈴：四分音符の位置で、半分ほど休む。ときどき1オクターブ上（A と同じ） */
    if (s % 4 === 0 && hrand(n, 3) < 0.55) bell(tt(0), BELL_NIGHT[Math.floor(n / 4) % 7] + (hrand(n, 4) < 0.2 ? 12 : 0), 0.75, 2.0);
    if (bar % 8 === 4 || bar % 8 === 5) fuePlay(PH.thA, (bar % 2) * 16 + s, tt(0.003), sd, 0.8, false, n);
  }

  /* つかえた：刻みは止めて、1小節に1度だけ締太鼓が小さく間を数える */
  function stepStuck(t, n, s) {
    if (s === 0 && t - S.sceneT > 1.2) shimeHit(t, 0.25, 1);
  }

  /* 魂振り：全部の層が16分。締太鼓2人は32分ずらし、大胴は拍ごと、鉦はチャンチキを休みなく、笛はヒシギ */
  function stepTama(t, n, s, sd, tt) {
    shimeHit(tt(0), s % 4 === 0 ? 1.05 : 0.62, 0);
    shimeHit(tt(0) + sd * 0.5, 0.55, 1);
    if (s % 4 === 0) odaiko(tt(0.003), 1.05, 'don');
    else if (s % 4 === 2) odaiko(tt(0.003), 0.5, 'ko');
    kaneHit(tt(0.008), s % 4 === 0 ? 1 : 0.55, s % 4 === 0);
    if (s % 2 === 0) bass(tt(-0.004), 52 + (s % 4 ? 12 : 0), s % 4 === 0 ? 1 : 0.7, sd * 1.6);
    if (S.fueNeed) { S.fueNeed = false; fueTrill(tt(0.003), 93, 95, 2.4, 1.1); }
  }

  /* 夜明けに帰る：ソが中心。刻みは表だけに減らし、時間とともに太鼓が薄く、はじく音と高い所が明るくなる */
  function stepBack(t, n, s, sd, tt) {
    if (s === 0) {
      S.bb++;
      padChord(t, DAWN[S.bb % 8], 0.08);
    }
    const bar = Math.max(0, S.bb), p = Math.min(1, (t - S.sceneT) / 60), ch = DAWN[bar % 8];
    if (s % 4 === 0) shimeHit(tt(0), (s === 0 ? 0.8 : 0.5) * (1 - 0.4 * p), 0);
    if (s === 14 && bar % 2 === 1) shimeHit(tt(0.006), 0.5 * (1 - 0.4 * p), 1);
    if (s === 0 && bar % 2 === 0) odaiko(tt(0.004), 0.7 * (1 - 0.5 * p), 'don');
    if (s === 8) kaneHit(tt(0.009), 0.45 * (1 - 0.3 * p), true);
    if (s === 0 || s === 8) bass(tt(-0.004), ch.root, 0.6, sd * 6);
    /* 鈴は4分で6つの周期、明けるほどときどき1オクターブ上に抜ける。はじく音は8分で和音を刻み、だんだん大きくなる */
    if (s % 4 === 0) bell(tt(0), BELL_DAWN[Math.floor(n / 4) % 6] + ((p > 0.5 && s === 8) ? 12 : 0), 0.6 + 0.2 * p, 1.4);
    if (s % 2 === 0) pluck(tt(0), ch.v[1 + (s / 2) % 4] + 12, 0.3 + 0.4 * p, 0.45);
    /* 笛：16小節で一回り。主題（夜明けの形）を4小節、4小節休み、飾りをつけてもう一度、4小節休み */
    const ph = bar % 16;
    if (ph < 4) fuePlay(ph < 2 ? PH.tdA : PH.tdB, (ph % 2) * 16 + s, tt(0.003), sd, 0.9, false, n);
    else if (ph >= 8 && ph < 12) fuePlay(ph < 10 ? PH.tdA : PH.tdB, (ph % 2) * 16 + s, tt(0.003), sd, 0.9, true, n);
  }

  /* ================= 7. 拍の時刻（ゲームが掛け声・足音・担ぎ手の弾みを曲にそろえるため） ================= */

  /*
    予約した16分の時刻を、新しいものから HIST 個だけ覚えておく（約3秒ぶん）。
    覚えるのは揺れ・跳ねをかける前の格子の時刻。拍の頭（16分の 0・4・8・12 番目）には跳ねがなく、決まったずれも 0〜1 ミリ秒。
  */
  const HIST = 96;
  const hist = [];
  function toward(bpm, tgt) {
    const d = tgt - bpm;
    return Math.abs(d) <= 0.3 ? tgt : bpm + Math.sign(d) * 0.3;
  }
  /*
    まだ予約していない先の16分を、今のテンポのまま延ばして求める。
    待っている場面の切り替え（processQueue・applyScene と同じ決まり：拍の頭で替わる、魂振りはすぐ 144、夜明けは 112 まで落とす）と、
    担ぐ場面の段の変わり目でテンポの目標が替わる所（stepCarry と同じ決まり）もなぞる。each(n, t) が true を返したら止める
  */
  function project(each) {
    let n = S.n, x = S.next, bpm = S.bpm, tgt = S.bpmT, lead = S.lead, fb = S.fb, sc = S.scene, qi = 0, resume = S.resumeTo;
    let carry = S.scene === 'carry' && S.applied;
    const q = S.q;
    for (let k = 0; k < 4096; k++) {
      if (each(n, x)) return;
      while (qi < q.length && q[qi].t <= x + 1e-6) {
        if (qi + 1 < q.length && q[qi + 1].t <= x + 1e-6) { qi++; continue; }
        const nm = q[qi].name;
        if (nm !== 'stuck' && n % 4 !== 0) break;
        qi++;
        if (nm === sc) continue;
        const prev = sc;
        sc = nm; tgt = BPM[nm]; carry = nm === 'carry';
        if (nm === 'tamafuri') bpm = BPM.tamafuri;
        else if (nm === 'back') bpm = Math.min(bpm, 112);
        else if (nm === 'carry') { const rem = 16 - n % 16; lead = rem < 8 ? rem + 16 : rem; resume = prev === 'stuck' ? 4 : 0; }
      }
      if (carry) {
        if (lead > 0) { lead--; if (lead === 0) fb = resume - 1; }
        else if (n % 16 === 0) { fb = fb + 1 >= FORM.length ? 0 : fb + 1; tgt = SEC_BPM[FORM[fb]]; }
      }
      bpm = toward(bpm, tgt);
      x += 15 / bpm;
      n++;
    }
  }
  /* 時刻 t での16分の位置（小数）。予約済みの所は覚えた時刻で、その先は project で */
  function stepPos(t) {
    if (!hist.length) return null;
    if (t < hist[0].t) return hist[0].n - (hist[0].t - t) * hist[0].bpm / 15;
    if (t >= S.next) {
      let p = null, pn = 0, px = 0;
      project(function (n, x) {
        if (x > t) { p = pn + (t - px) / (x - px); return true; }
        pn = n; px = x;
        return false;
      });
      return p;
    }
    let a = 0, b = hist.length - 1;
    while (a < b) { const m = (a + b + 1) >> 1; if (hist[m].t <= t) a = m; else b = m - 1; }
    const t1 = a + 1 < hist.length ? hist[a + 1].t : S.next;
    return hist[a].n + (t - hist[a].t) / (t1 - hist[a].t);
  }
  /* n 番目の16分の時刻 */
  function stepTime(n) {
    if (!hist.length) return null;
    if (n < hist[0].n) return hist[0].t - (hist[0].n - n) * 15 / hist[0].bpm;
    if (n < S.n) return hist[n - hist[0].n].t;
    let out = null;
    project(function (k, x) { if (k >= n) { out = x; return true; } return false; });
    return out;
  }

  function playStep(t, n) {
    const s = n % 16, sd = 15 / S.bpm;
    /* 機械の揺れ：裏の16分は少し跳ね、位置ごとに決まったずれ、楽器ごとに決まった遅れ */
    const tt = function (lag) {
      return Math.max(ctx.currentTime, t + (s % 2 ? SWING * sd : 0) + MICRO[s] * 0.001 + lag);
    };
    if (s === 0 && S.dlyBpm !== S.bpm) { S.dlyBpm = S.bpm; dly.delayTime.setTargetAtTime(0.75 * 60 / S.bpm, t, 0.5); }
    const sc = S.scene;
    if (sc === 'idle') stepIdle(t, n, s, sd, tt);
    else if (sc === 'carry') stepCarry(t, n, s, sd, tt);
    else if (sc === 'stuck') stepStuck(t, n, s);
    else if (sc === 'tamafuri') stepTama(t, n, s, sd, tt);
    else if (sc === 'back') stepBack(t, n, s, sd, tt);
  }

  /* ================= 8. 外から呼ぶ口 ================= */

  return {
    setScene(name, t) {
      if (!MIX[name]) return;
      if (!(t >= 0)) t = ctx.currentTime;
      /* つかえた：もう予約済みの区間の中なら、待たずにその時刻で止める */
      if (name === 'stuck' && S.started && !S.q.length && t < S.next) {
        applyScene('stuck', Math.max(t, ctx.currentTime), S.n % 16);
        return;
      }
      insertSorted(S.q, { name: name, t: t });
    },

    setIntensity(x, t) {
      if (!(t >= 0)) t = ctx.currentTime;
      x = clamp(+x || 0, 0, 1);
      insertSorted(S.qx, { x: x, t: t });
    },

    scheduleUntil(tEnd) {
      if (S.next === null) { S.next = ctx.currentTime + 0.05; S.started = true; }
      /* 画面が裏に回って遅れたときは、今に追いつく */
      if (S.next < ctx.currentTime - 0.05) S.next = ctx.currentTime + 0.02;
      const end = Math.min(tEnd, S.stopAt);
      while (S.next < end) {
        const t = S.next, n = S.n;
        processQueue(t, n % 16);
        if (!S.applied) applyScene(S.scene, t, n % 16);
        playStep(t, n);
        hist.push({ n: n, t: t, bpm: S.bpm });
        if (hist.length > HIST) hist.shift();
        /* テンポは1歩ごとに 0.3 ずつ目標へ近づく（急に変えない） */
        if (S.bpm !== S.bpmT) {
          const d = S.bpmT - S.bpm;
          S.bpm = Math.abs(d) <= 0.3 ? S.bpmT : S.bpm + Math.sign(d) * 0.3;
        }
        S.next += 15 / S.bpm;
        S.n++;
      }
    },

    /*
      t 以後でいちばん近い格子の時刻（ctx の時刻）。div は16分いくつで1つか：4＝拍の頭、2＝8分、16＝小節の頭。
      テンポは場面や段で変わるので、予約済みの所は実際の時刻、その先は今のテンポ（とその変わり方）で求める。まだ鳴らしていなければ null
    */
    nextBeat(t, div) {
      div = div > 0 ? Math.round(div) : 4;
      const p = stepPos(t);
      if (p === null) return null;
      return stepTime(Math.ceil((p - 1e-4) / div) * div);
    },

    /* 時刻 t の拍の位置（拍の数、小数）と、1秒あたりの拍の数。担ぎ手の弾みをそろえるのに使う */
    beatAt(t) {
      const p = stepPos(t);
      if (p === null) return null;
      return { pos: p / 4, bps: S.bpm / 60 };
    },

    /* 覚えている16分の時刻の写し（確かめ用） */
    steps() { return hist.slice(); },

    /* 鈴の音を鳴る前に少しずつ作る（1回に約 sec 秒ぶん）。まだ残っていれば true。リアルタイムで重くしないため、ゲームが間をあけて呼ぶ（呼ばなくても鳴る） */
    prepare(sec) { return bellPrepare(sec); },

    stop(t) {
      if (!(t >= 0)) t = ctx.currentTime;
      if (S.stopAt !== Infinity) return;
      S.stopAt = t;
      hold(master.gain, t);
      master.gain.setTargetAtTime(0, t, 0.15);
      for (const o of persist) { try { o.stop(t + 1.5); } catch (e) { /* もう止まっている */ } }
      for (const v of shoVoices) { try { v.o.stop(t + 1.5); } catch (e) { /* もう止まっている */ } }
    }
  };
};
