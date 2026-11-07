'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { planLanes4, sampleLanes4, LANES4_DEFAULTS, LANES4_UI, stageBounds } = require('../lanes4.js');

const R = 3, C = 14, T = 5;
const P = (seed, params, r = R, c = C) => planLanes4({ R: r, C: c, T, seed, params });
const lanes = (plan, kStep) => {
  const st = plan.steps[kStep], by = {};
  st.cubes.forEach(q => {
    const k = st.axis === 'row' ? q.fy : q.fx;
    (by[k] = by[k] || []).push(q);
  });
  return Object.values(by);
};
const pos = (st, q) => (st.axis === 'row' ? [q.fx, q.tx] : [q.fy, q.ty]);
const meanAbsS = (params, n = 60) => {
  let sum = 0, cnt = 0;
  for (let s = 1; s <= n; s++) P(s, params).steps.forEach(st => st.lanes.forEach(l => { sum += Math.abs(l.s); cnt++; }));
  return sum / cnt;
};

test('1 determinism', () => {
  assert.deepStrictEqual(P(5), P(5));
  assert.notDeepStrictEqual(P(5), P(6));
});

test('2 packed  at t=T ', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const out = sampleLanes4(P(seed, {}), T);
    assert.strictEqual(out.length, R * C);
    assert.ok(out.every(o => o.stopped));
    const keys = new Set(out.map(o => o.x + ',' + o.y));
    assert.strictEqual(keys.size, R * C);
    out.forEach(o => assert.ok(Number.isInteger(o.x) && o.x >= 0 && o.x < C && Number.isInteger(o.y) && o.y >= 0 && o.y < R));
  }
});

test('3 order preserved within lanes (plan and sampled)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const plan = P(seed);
    plan.steps.forEach((st, k) => lanes(plan, k).forEach(ln => {
      const s = ln.map(q => pos(st, q)).sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < s.length; i++) {
        assert.ok(s[i][0] > s[i - 1][0], 'start order');
        assert.ok(s[i][1] > s[i - 1][1], 'end order');
      }
    }));
  }
});

test('4 gap fraction ~ GAP_P', () => {
  let empty = 0, total = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const a = P(seed).A0;
    a.forEach(v => { total++; if (!v) empty++; });
  }
  assert.ok(Math.abs(empty / total - LANES4_DEFAULTS.GAP_P) < 0.01, String(empty / total));
});

test('9 defaults', () => {
  assert.ok(!('PAIRING' in LANES4_DEFAULTS));
  assert.strictEqual(LANES4_DEFAULTS.Q_FULL, 0);
  assert.strictEqual(LANES4_DEFAULTS.CAP_COL, 1.9);
  assert.ok(!('A0_GAPS' in LANES4_DEFAULTS));
  assert.ok(!/rigid/.test(require('fs').readFileSync(require.resolve('../lanes4.js'), 'utf8')));
});

test('16 PAIRING ignored; GAP_P clamped to 0.20; UI keys', () => {
  assert.deepStrictEqual(P(3, { PAIRING: 'rigid' }), P(3));
  assert.deepStrictEqual(P(3, { GAP_P: 0.9 }), P(3, { GAP_P: 0.2 }));
  assert.deepStrictEqual(LANES4_UI.map(u => u.key).sort(), ['GAP_P', 'K', 'T']);
  const g = LANES4_UI.find(u => u.key === 'GAP_P');
  assert.strictEqual(g.max, 0.2);
  LANES4_UI.forEach(u => ['label', 'help', 'min', 'max', 'step', 'default'].forEach(f => assert.ok(f in u, u.key + '.' + f)));
});

test('17 ids unique per frame, stable and continuous across steps', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const plan = P(seed), N = 500, dt = T / N;
    let prev = null;
    for (let i = 0; i <= N; i++) {
      const cur = sampleLanes4(plan, i * dt), m = new Map(cur.map(o => [o.id, o]));
      assert.strictEqual(m.size, cur.length, 'unique ids');
      if (prev) cur.forEach(o => { const q = prev.get(o.id); if (q) assert.ok(Math.abs(q.x - o.x) < 0.6 && Math.abs(q.y - o.y) < 0.6, 'id jump seed ' + seed); });
      prev = m;
    }
  }
});

test('18 stageBounds', () => {
  const plan = P(2), b = stageBounds(plan);
  assert.strictEqual(b.length, plan.K + 1);
  assert.strictEqual(b[0], 0);
  assert.ok(Math.abs(b[plan.K] - T) < 1e-9);
  b.forEach((v, i) => { if (i) assert.ok(v > b[i - 1]); assert.ok(Math.abs(v - i * plan.D) < 1e-9); });
});

test('10 only on-board survivors carry; cube count never grows', () => {
  const onB = (x, y) => x >= 0 && x < C && y >= 0 && y < R;
  for (let seed = 1; seed <= 30; seed++) {
    const plan = P(seed, {});
    for (let k = 0; k + 1 < plan.steps.length; k++) {
      const ends = plan.steps[k].cubes.filter(q => onB(q.tx, q.ty)).map(q => q.tx + ',' + q.ty).sort();
      const starts = plan.steps[k + 1].cubes.filter(q => !q.enter).map(q => q.fx + ',' + q.fy).sort();
      assert.deepStrictEqual(starts, ends);
      assert.ok(ends.length <= R * C);
    }
  }
});

test('5 s distribution', () => {
  let n = 0, zero = 0, big = 0;
  for (let seed = 1; seed <= 100; seed++) {
    P(seed, { Q_FULL: 0, CAP_COL: 1 }).steps.forEach(st => st.lanes.forEach(l => {
      n++;
      if (Math.abs(l.s) <= 1) zero++;
      if (Math.abs(l.s) >= l.L) big++;
    }));
  }
  assert.ok(big / n < 0.01, 'full replace rare');
  assert.ok(zero / n > 0.2, 'peak near 0');
  P(9, { Q_FULL: 1 }).steps.forEach(st => st.lanes.forEach(l => assert.strictEqual(Math.abs(l.s), l.L)));
});

test('6 axes alternate, K only changes step duration', () => {
  assert.deepStrictEqual(P(1, { K: 1 }).steps.map(s => s.axis), ['row']);
  const p5 = P(1);
  assert.deepStrictEqual(p5.steps.map(s => s.axis), ['row', 'col', 'row', 'col', 'row']);
  assert.strictEqual(p5.D, T / 5);
  assert.strictEqual(P(1, { K: 2 }).D, T / 2);
});

test('7 continuity between steps for surviving cubes', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const plan = P(seed);
    for (let k = 0; k + 1 < plan.steps.length; k++) {
      const onBoard = (x, y) => x >= 0 && x < C && y >= 0 && y < R;
      const ends = plan.steps[k].cubes.filter(q => onBoard(q.tx, q.ty)).map(q => q.tx + ',' + q.ty).sort();
      const starts = plan.steps[k + 1].cubes.filter(q => onBoard(q.fx, q.fy)).map(q => q.fx + ',' + q.fy);
      // every next-step on-board start must be a prior on-board end; entering cubes may add more only if guard-placed
      const endSet = new Set(ends);
      const matched = starts.filter(s => endSet.has(s)).length;
      assert.strictEqual(matched, ends.length, 'all surviving ends continue');
    }
  }
});

test('8 params change distribution via same code path', () => {
  assert.strictEqual(meanAbsS({ CAP_ROW: 0, CAP_COL: 0, Q_FULL: 0 }), 0);
  assert.ok(meanAbsS({ Q_FULL: 0, W_LO: 2, W_HI: 2 }) > meanAbsS({ Q_FULL: 0, W_LO: 0.5, W_HI: 0.5 }));
  assert.ok(meanAbsS({ Q_FULL: 0, CAP_COL: 2 }) >= meanAbsS({ Q_FULL: 0, CAP_COL: 1 }));
});

test('12 no mid-board pop: entering cubes start fully off board; frames continuous except at clip edge', () => {
  const R2 = 3, C2 = 14;
  for (let seed = 1; seed <= 25; seed++) {
    const plan = planLanes4({ R: R2, C: C2, T, seed, params: { Q_FULL: 0.2 } });
    let maxD = 0;
    plan.steps.forEach(st => st.cubes.forEach(q => {
      maxD = Math.max(maxD, Math.abs(q.tx - q.fx), Math.abs(q.ty - q.fy));
      if (q.enter) {
        const f = st.axis === 'row' ? q.fx : q.fy, L = st.axis === 'row' ? C2 : R2;
        assert.ok(f <= -1 || f >= L, `seed ${seed}: entering cube starts on board at ${f}`);
      }
    }));
    const N = 1000, dt = T / N, delta = (Math.PI / 2) * maxD / plan.D * dt + 1e-6;
    const near = (a, list) => list.some(b => Math.abs(a.x - b.x) <= delta && Math.abs(a.y - b.y) <= delta);
    const edge = o => o.x <= -1 + delta || o.x >= C2 - delta || o.y <= -1 + delta || o.y >= R2 - delta;
    let prev = sampleLanes4(plan, 0);
    for (let i = 1; i <= N; i++) {
      const cur = sampleLanes4(plan, i * dt);
      cur.forEach(o => assert.ok(near(o, prev) || edge(o), `seed ${seed} frame ${i}: pop-in at ${o.x},${o.y}`));
      prev.forEach(o => assert.ok(near(o, cur) || edge(o), `seed ${seed} frame ${i}: vanish at ${o.x},${o.y}`));
      prev = cur;
    }
  }
});

const ease = u => (1 - Math.cos(Math.PI * u)) / 2;
test('13 gap widths between neighbour cubes (by identity) are continuous in t', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const plan = planLanes4({ R: 3, C: 14, T: 5.5, seed, params: {} }), n = 400;
    plan.steps.forEach((st, k) => {
      const row = st.axis === 'row', L = row ? 14 : 3, by = {};
      st.cubes.forEach(q => { const key = row ? q.fy : q.fx; (by[key] = by[key] || []).push({ f: row ? q.fx : q.fy, t: row ? q.tx : q.ty }); });
      const maxD = Math.max(...st.cubes.map(q => Math.max(Math.abs(q.tx - q.fx), Math.abs(q.ty - q.fy))));
      const bound = 2 * (Math.PI / 2) * maxD / n + 1e-6;
      Object.values(by).forEach(a => {
        a.sort((x, y) => x.f - y.f);
        let prev = null;
        for (let i = 0; i <= n; i++) {
          const pos = a.map(c => c.f + (c.t - c.f) * ease(i / n));
          const g = a.slice(1).map((_, j) => ({ w: pos[j + 1] - pos[j] - 1, vis: pos[j] > -1 && pos[j + 1] < L }));
          if (prev) g.forEach((x, j) => { if (x.vis && prev[j].vis) assert.ok(Math.abs(x.w - prev[j].w) <= bound, `s${seed} step${k}: gap jump`); });
          prev = g;
        }
      });
    });
  }
});

test('14 entering cubes start contiguous right behind the edge (gaps open on screen, not off-board)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const plan = planLanes4({ R: 3, C: 14, T: 5.5, seed, params: {} });
    plan.steps.forEach(st => {
      const row = st.axis === 'row', by = {};
      st.cubes.filter(q => q.enter).forEach(q => { const key = row ? q.fy : q.fx; (by[key] = by[key] || []).push(row ? q.fx : q.fy); });
      Object.values(by).forEach(a => {
        a.sort((x, y) => x - y);
        // front space or mirrored: contiguous run ending adjacent to an edge
        const ok = a.every((v, i) => i === 0 || v - a[i - 1] === 1) && (a[a.length - 1] === -1 || a[0] === (row ? 14 : 3));
        assert.ok(ok, `s${seed}: ${a}`);
      });
    });
  }
});

// ---- hole birth/death measurement (anonymous cubes; holes tracked by overlap) ----
const HR = 3, HC = 14, HT = 5.5, HN = 1000, hdt = HT / HN;
function holeStats(seeds) {
  const R = HR, C = HC, T = HT, N = HN, dt = hdt;
  const S={born:0,bornEdge:0,died:0,diedEdge:0,wb:0,wd:0,bornPop:0,diedPop:0,ex:null};
  for(let seed=1;seed<=seeds;seed++){
    const plan=planLanes4({R,C,T,seed,params:{}});
    const vmax=plan.steps.map(st=>Math.PI/2*Math.max(...st.cubes.map(q=>Math.max(Math.abs(q.tx-q.fx),Math.abs(q.ty-q.fy))))/plan.D);
    let prev=null,pk=-1;
    for(let i=0;i<=N;i++){
      const t=i*dt,k=Math.min(plan.K-1,Math.floor(t/plan.D)),row=plan.steps[k].axis==='row',Lx=row?C:R,by={};
      sampleLanes4(plan,t).forEach(o=>{const key=row?Math.round(o.y):Math.round(o.x);(by[key]=by[key]||[]).push(row?o.x:o.y)});
      const cur={};
      for(const key in by){const a=by[key].sort((x,y)=>x-y);cur[key]=[];
        for(let j=0;j+1<a.length;j++){const w=a[j+1]-a[j]-1;if(w>0.02)cur[key].push({lo:a[j]+1,hi:a[j+1],w,edge:a[j]<-1+2*vmax[k]*dt+0.05||a[j+1]>Lx-0.05-2*vmax[k]*dt})}}
      if(prev&&pk===k){
        const tol=vmax[k]*dt*2+0.02;
        const ov=(h,list)=>list.some(g=>g.lo<h.hi&&g.hi>h.lo);
        for(const key in cur)cur[key].forEach(h=>{if(!ov(h,prev[key]||[])){S.born++;if(h.edge)S.bornEdge++;else{if(h.w>S.wb){S.wb=h.w;S.ex={seed,k,key,t}}if(h.w>tol)S.bornPop++}}});
        for(const key in prev)prev[key].forEach(h=>{if(!ov(h,cur[key]||[])){S.died++;if(h.edge)S.diedEdge++;else{if(h.w>S.wd)S.wd=h.w;if(h.w>tol)S.diedPop++}}});
      }
      prev=cur;pk=k;
    }
  }
  return S;
}

test('15 interior holes open (born smoothly) as often as they close: ', () => {
  const S = holeStats(30);
  assert.strictEqual(S.bornPop, 0, 'interior births must not pop');
  assert.strictEqual(S.diedPop, 0, 'interior deaths must not pop');
  assert.ok(S.born - S.bornEdge >= 150, `interior hole births: ${S.born - S.bornEdge} (edge ${S.bornEdge}); died ${S.died - S.diedEdge} interior`);
});
