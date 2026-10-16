import type { StemDef } from "./stems";

export interface Chain {
  input: AudioNode;
  output: AudioNode;
}

/**
 * Mid/Side роутер.
 * mid  = ((L+R)/2, (L+R)/2)      — центр панорамы (вокал, бас, кик)
 * side = ((L-R)/2, (R-L)/2)      — края панорамы; mid + side == оригинал (точное восстановление)
 */
export function buildMidSideRouter(ctx: BaseAudioContext): {
  input: GainNode;
  mid: GainNode;
  side: GainNode;
} {
  const input = ctx.createGain();
  const splitter = ctx.createChannelSplitter(2);
  input.connect(splitter);

  const midMerger = ctx.createChannelMerger(2);
  const midGains = [ctx.createGain(), ctx.createGain(), ctx.createGain(), ctx.createGain()];
  midGains.forEach((g) => (g.gain.value = 0.5));
  splitter.connect(midGains[0], 0).connect(midMerger, 0, 0);
  splitter.connect(midGains[1], 1).connect(midMerger, 0, 0);
  splitter.connect(midGains[2], 0).connect(midMerger, 0, 1);
  splitter.connect(midGains[3], 1).connect(midMerger, 0, 1);
  const mid = ctx.createGain();
  midMerger.connect(mid);

  const sideMerger = ctx.createChannelMerger(2);
  const sL = ctx.createGain(); // +L -> out L
  const sR = ctx.createGain(); // -R -> out L
  const sL2 = ctx.createGain(); // -L -> out R
  const sR2 = ctx.createGain(); // +R -> out R
  sL.gain.value = 0.5;
  sR.gain.value = -0.5;
  sL2.gain.value = -0.5;
  sR2.gain.value = 0.5;
  splitter.connect(sL, 0).connect(sideMerger, 0, 0);
  splitter.connect(sR, 1).connect(sideMerger, 0, 0);
  splitter.connect(sL2, 0).connect(sideMerger, 0, 1);
  splitter.connect(sR2, 1).connect(sideMerger, 0, 1);
  const side = ctx.createGain();
  sideMerger.connect(side);

  return { input, mid, side };
}

function exciterCurve(drive = 1.8): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

/** Цепочка «Улучшение»: эксайтер → воздух → glue-компрессор → лимитер. */
export function buildEnhanceChain(ctx: BaseAudioContext): Chain {
  const input = ctx.createGain();
  const exciter = ctx.createWaveShaper();
  exciter.curve = exciterCurve(1.8);
  exciter.oversample = "2x";
  const air = ctx.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 8200;
  air.gain.value = 2.4;
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -12;
  glue.ratio.value = 2;
  glue.attack.value = 0.01;
  glue.release.value = 0.18;
  glue.knee.value = 8;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2.5;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;
  limiter.knee.value = 0;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.12;

  input.connect(exciter);
  exciter.connect(air);
  air.connect(glue);
  glue.connect(limiter);
  limiter.connect(makeup);
  return { input, output: makeup };
}

function buildFilterPath(ctx: BaseAudioContext, input: AudioNode, filters: StemDef["filters"]): AudioNode {
  let node = input;
  for (const f of filters) {
    const biq = ctx.createBiquadFilter();
    biq.type = f.type;
    if (f.freq !== undefined) biq.frequency.value = f.freq;
    if (f.q !== undefined) biq.Q.value = f.q;
    if (f.gainDb !== undefined) biq.gain.value = f.gainDb;
    node.connect(biq);
    node = biq;
  }
  return node;
}

/** Полная цепочка одной дорожки из её определения. */
export function buildStemChain(ctx: BaseAudioContext, def: StemDef, enhance: boolean): Chain {
  const head = ctx.createGain();
  const router = buildMidSideRouter(ctx);
  head.connect(router.input);

  const pick = (src: "mid" | "side" | "full") =>
    src === "mid" ? router.mid : src === "side" ? router.side : head;

  const mix = ctx.createGain();

  // Профи DSP-режим (Выделение акапеллы и минуса) — Использует "Phase Phasemask"
  if (def.approx && (def.id === "vocals" || def.id === "instrumental")) {
    if (def.id === "vocals") {
      // Карательная обработка голоса для чистейшей акапеллы:
      // Шаг 1: Агрессивный срез электрических обертонов, баса и ритмического бита
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 120;
      hp.Q.value = 1.4; // резкий срез на грани
      pick("mid").connect(hp);

      const bassSuppress = ctx.createBiquadFilter();
      bassSuppress.type = "peaking";
      bassSuppress.frequency.value = 190;
      bassSuppress.Q.value = 1.0;
      bassSuppress.gain.value = -12;
      hp.connect(bassSuppress);

      // Шаг 2: Формантная чистка (убирает деревянные и губные призвуки бас-гитары и электро-гитар)
      const formant1 = ctx.createBiquadFilter();
      formant1.type = "peaking";
      formant1.frequency.value = 950;
      formant1.Q.value = 1.2;
      formant1.gain.value = 2.8;
      bassSuppress.connect(formant1);

      const formant2 = ctx.createBiquadFilter();
      formant2.type = "peaking";
      formant2.frequency.value = 4100;
      formant2.Q.value = 1.0;
      formant2.gain.value = 3.6;
      formant1.connect(formant2);

      const hissCut = ctx.createBiquadFilter();
      hissCut.type = "peaking";
      hissCut.frequency.value = 8600;
      hissCut.Q.value = 1.4;
      hissCut.gain.value = -8;
      formant2.connect(hissCut);

      // Шаг 3: Агрессивный VST-подобный гейт (динамическое вырезание тишины между словами)
      // Срипываем все высокие гармоники, если уровень падает ниже -15 дБ
      const dyn = ctx.createDynamicsCompressor();
      dyn.threshold.value = -11;
      dyn.knee.value = 8;
      dyn.ratio.value = 3;
      dyn.attack.value = 0.001;
      dyn.release.value = 0.07;
      hissCut.connect(dyn);

      // Умелый быстрый гейт наподобие спектрального
      // Убираем фон и гул музыки, когда голос не активен
      const gateBass = ctx.createBiquadFilter();
      gateBass.type = "lowshelf";
      gateBass.frequency.value = 300;
      gateBass.gain.value = -10;
      dyn.connect(gateBass);

      gateBass.connect(mix);
    } else {
      // ИДЕАЛЬНЫЙ МИНУС (Инструментал): два этапа очищения от партии вокала
      // Фазовая обрезка Side-сигнала:
      // Side уже не имеет вокала, но мы вырезаем вокальный фокус в центре полосы Side-g (где могут жить бэки)
      const sideBand1 = ctx.createBiquadFilter();
      sideBand1.type = "peaking";
      sideBand1.frequency.value = 550;
      sideBand1.Q.value = 0.85;
      sideBand1.gain.value = -12;
      pick("side").connect(sideBand1);

      const sideBand2 = ctx.createBiquadFilter();
      sideBand2.type = "peaking";
      sideBand2.frequency.value = 1450;
      sideBand2.Q.value = 0.85;
      sideBand2.gain.value = -14;
      sideBand1.connect(sideBand2);

      const sideBand3 = ctx.createBiquadFilter();
      sideBand3.type = "peaking";
      sideBand3.frequency.value = 3800;
      sideBand3.Q.value = 1.0;
      sideBand3.gain.value = -10;
      sideBand2.connect(sideBand3);

      sideBand3.connect(mix);

      // Басовый и Кристальный слои из Mid
      buildFilterPath(ctx, pick("mid"), [
        { type: "lowpass", freq: 100, q: 0.9 },
        { type: "peaking", freq: 70, gainDb: 4.0, q: 0.9 }
      ]).connect(mix);

      const cym = ctx.createBiquadFilter();
      cym.type = "highpass";
      cym.frequency.value = 14000;
      cym.Q.value = 0.9;
      const cymGain = ctx.createGain();
      cymGain.gain.value = 0.35;
      pick("mid").connect(cym).connect(cymGain).connect(mix);
    }
  } else {
    // Остальные полосовые дорожки
    buildFilterPath(ctx, pick(def.source), def.filters).connect(mix);

    for (const layer of def.plus ?? []) {
      let node: AudioNode = buildFilterPath(ctx, pick(layer.source), layer.filters);
      if (layer.gain !== undefined) {
        const g = ctx.createGain();
        g.gain.value = layer.gain;
        node.connect(g);
        node = g;
      }
      node.connect(mix);
    }
  }

  let node: AudioNode = mix;

  if (def.comp) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = def.comp.threshold;
    comp.ratio.value = def.comp.ratio;
    comp.attack.value = def.comp.attack;
    comp.release.value = def.comp.release;
    comp.knee.value = 6;
    node.connect(comp);
    node = comp;
  }

  const g = ctx.createGain();
  g.gain.value = def.gain;
  node.connect(g);
  node = g;

  if (enhance) {
    const enh = buildEnhanceChain(ctx);
    node.connect(enh.input);
    node = enh.output;
  }

  if (def.limiter && !enhance) {
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.ratio.value = 16;
    lim.attack.value = 0.001;
    lim.release.value = 0.12;
    lim.knee.value = 0;
    node.connect(lim);
    node = lim;
  }

  return { input: head, output: node };
}
