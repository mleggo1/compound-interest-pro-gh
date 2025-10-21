(() => {
  const React = window.React;
  const ReactDOM = window.ReactDOM;
  const e = React.createElement;

  // ---------- helpers ----------
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
  const nz = (n, fallback = 0) => (Number.isFinite(n) ? n : fallback);

  const fmtAUD = (n) => "A$" + nz(n, 0).toLocaleString("en-AU", { maximumFractionDigits: 0 });
  const fmtAxisCurrency = (n) => "A$" + nz(n, 0).toLocaleString("en-AU", { maximumFractionDigits: 0 });

  const parseMoneyText = (s) => {
    const t = String(s || "").replace(/[^0-9]/g, "");
    return t ? Number(t) : 0;
  };

  const parsePercentText = (s) => {
    const t = String(s || "").replace(/[^0-9.]/g, "");
    const v = t === "" ? NaN : Number(t);
    return Number.isFinite(v) ? v : NaN;
  };

  const monthlyFromAnnualWithFees = (annualPct, feePct) => {
    const gross = 1 + annualPct;
    const feeFactor = 1 - clamp(feePct, 0, 0.1);
    return Math.pow(gross * feeFactor, 1 / 12) - 1;
  };

  const monthlyInflFromAnnual = (inflPct) => Math.pow(1 + inflPct, 1 / 12) - 1;

  const annuityRealMonthly = (balanceAtRet, rRealMonthly, months) => {
    if (months <= 0) return 0;
    if (Math.abs(rRealMonthly) < 1e-9) return balanceAtRet / months;
    return balanceAtRet * rRealMonthly / (1 - Math.pow(1 + rRealMonthly, -months));
  };

  function MoneyInput({ label, value, onChange, id }) {
    const [text, setText] = React.useState(value.toLocaleString("en-AU"));
    React.useEffect(() => {
      setText(value.toLocaleString("en-AU"));
    }, [value]);
    const commit = () => {
      const v = parseMoneyText(text);
      onChange(v);
      setText(v.toLocaleString("en-AU"));
    };
    return e(
      "div",
      { className: "row" },
      e("label", { htmlFor: id }, label),
      e("input", {
        id,
        type: "text",
        inputMode: "numeric",
        value: text,
        onChange: (ev) => setText(ev.target.value),
        onBlur: commit,
        onKeyDown: (ev) => {
          if (ev.key === "Enter") {
            commit();
            ev.currentTarget.blur();
          }
        },
        "aria-label": label,
      })
    );
  }

  function PercentInput({ label, value, onChange, id, min = 0, max = 30 }) {
    const [text, setText] = React.useState(String(value));
    React.useEffect(() => {
      setText(String(value));
    }, [value]);
    const commit = () => {
      const v = parsePercentText(text);
      const clamped = Number.isFinite(v) ? clamp(v, min, max) : value;
      onChange(clamped);
      setText(String(clamped));
    };
    return e(
      "div",
      { className: "row" },
      e("label", { htmlFor: id }, label),
      e("input", {
        id,
        type: "text",
        inputMode: "decimal",
        value: text,
        onChange: (ev) => setText(ev.target.value),
        onBlur: commit,
        onKeyDown: (ev) => {
          if (ev.key === "Enter") {
            commit();
            ev.currentTarget.blur();
          }
        },
        "aria-label": label,
      })
    );
  }

  function NumberInput({ label, value, onChange, id, min, max }) {
    const [text, setText] = React.useState(String(value));
    React.useEffect(() => {
      setText(String(value));
    }, [value]);
    const commit = () => {
      const v = Number(text);
      const clamped = Number.isFinite(v) ? clamp(v, min, max) : value;
      onChange(clamped);
      setText(String(clamped));
    };
    return e(
      "div",
      { className: "row" },
      e("label", { htmlFor: id }, label),
      e("input", {
        id,
        type: "number",
        min,
        max,
        value: text,
        onChange: (ev) => setText(ev.target.value),
        onBlur: commit,
        onKeyDown: (ev) => {
          if (ev.key === "Enter") {
            commit();
            ev.currentTarget.blur();
          }
        },
        "aria-label": label,
      })
    );
  }

  function project({
    currentAge,
    retireAge,
    lifeExpectancy,
    initialBalance,
    monthlyContribution,
    preRetAnnual,
    postRetAnnual,
    inflationAnnual,
    feesAnnual,
  }) {
    const r_pre = preRetAnnual / 100;
    const r_post = postRetAnnual / 100;
    const infl = inflationAnnual / 100;
    const fees = feesAnnual / 100;

    const mPre = monthlyFromAnnualWithFees(r_pre, fees);
    const mPost = monthlyFromAnnualWithFees(r_post, fees);
    const mInfl = monthlyInflFromAnnual(infl);

    const monthsTotal = Math.max(0, Math.round((lifeExpectancy - currentAge) * 12));
    const monthsToRet = Math.max(0, Math.round((retireAge - currentAge) * 12));
    const monthsPost = Math.max(0, monthsTotal - monthsToRet);

    let bal = Math.max(0, initialBalance);
    const points = [];
    let balAtRet = bal;

    for (let m = 1; m <= monthsToRet; m++) {
      const growth = bal * mPre;
      bal = bal + growth + monthlyContribution;
      if (m % 12 === 0) {
        const age = Math.floor(currentAge + m / 12);
        const real = bal / Math.pow(1 + mInfl, m);
        points.push({ age, nominal: bal, real });
      }
    }
    balAtRet = bal;

    const rRealMonthly = (1 + mPost) / (1 + mInfl) - 1;
    const aRealMonth = annuityRealMonthly(balAtRet, rRealMonthly, monthsPost);
    const sustainableAnnualToday = aRealMonth * 12;

    for (let k = 1; k <= monthsPost; k++) {
      const growth = bal * mPost;
      const withdrawNominal = aRealMonth * Math.pow(1 + mInfl, k);
      bal = bal + growth - withdrawNominal;
      if (bal < 0) bal = 0;
      const m = monthsToRet + k;
      if (m % 12 === 0) {
        const age = Math.floor(currentAge + m / 12);
        const real = bal / Math.pow(1 + mInfl, m);
        points.push({ age, nominal: bal, real });
      }
    }

    if (points.length === 0) {
      points.push({ age: Math.floor(currentAge), nominal: bal, real: bal });
    } else {
      const firstAge = Math.floor(currentAge);
      if (points[0].age > firstAge) {
        points.unshift({
          age: firstAge,
          nominal: Math.max(0, initialBalance),
          real: Math.max(0, initialBalance),
        });
      }
    }

    return {
      points,
      retirement: {
        age: retireAge,
        balanceNominal: balAtRet,
        balanceReal: balAtRet / Math.pow(1 + mInfl, monthsToRet),
        sustainableAnnualToday,
      },
    };
  }

  // -------- dynamic script loader (for heavy libs) --------
  const scriptCache = new Map();
  function loadScriptOnce(src, globalGetter) {
    if (scriptCache.has(src)) return scriptCache.get(src);
    const promise = new Promise((resolve, reject) => {
      try {
        const existing = globalGetter ? globalGetter() : undefined;
        if (existing) {
          resolve(existing);
          return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.defer = true;
        s.crossOrigin = "anonymous";
        s.onload = () => {
          try {
            resolve(globalGetter ? globalGetter() : undefined);
          } catch (e) {
            resolve(undefined);
          }
        };
        s.onerror = () => reject(new Error("Failed to load script: " + src));
        document.head.appendChild(s);
      } catch (err) {
        reject(err);
      }
    });
    scriptCache.set(src, promise);
    return promise;
  }

  const ensureRecharts = () => loadScriptOnce(
    "https://unpkg.com/recharts@2.13.2/umd/Recharts.min.js",
    () => window.Recharts
  );
  const ensureHtml2Canvas = () => loadScriptOnce(
    "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js",
    () => window.html2canvas
  );
  const ensureJsPDF = () => loadScriptOnce(
    "https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js",
    () => window.jspdf
  );

  function ChartView({ data, retireAge, axisColor }) {
    const containerRef = React.useRef(null);
    const [RechartsLib, setRechartsLib] = React.useState(null);

    React.useEffect(() => {
      let cancelled = false;
      const start = () => {
        ensureRecharts()
          .then((lib) => {
            if (!cancelled) setRechartsLib(lib);
          })
          .catch(() => {});
      };
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(start, { timeout: 500 });
      } else {
        setTimeout(start, 0);
      }
      return () => {
        cancelled = true;
      };
    }, []);

    if (!RechartsLib) {
      return e(
        "div",
        { className: "chart", ref: containerRef, "aria-busy": "true", "aria-live": "polite" },
        "Loading chart..."
      );
    }

    const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } =
      RechartsLib;

    return e(
      "div",
      { className: "chart" },
      e(
        ResponsiveContainer,
        null,
        e(
          LineChart,
          { data, margin: { top: 48, right: 24, bottom: 24, left: 8 } },
          e(CartesianGrid, { stroke: "#e2e8f0" }),
          e(XAxis, { dataKey: "age", tick: { fill: (axisColor || "#64748b").trim(), fontSize: 12 }, minTickGap: 8 }),
          e(YAxis, { tick: { fill: (axisColor || "#64748b").trim(), fontSize: 12 }, tickFormatter: fmtAxisCurrency, width: 90 }),
          e(Tooltip, {
            formatter: (v, name) => [fmtAUD(v), name],
            labelFormatter: (l) => "Age " + l,
            contentStyle: { background: "#ffffff", border: "1px solid #e2e8f0", color: "#0f172a" },
          }),
          e(Legend, { verticalAlign: "top", height: 24 }),
          e(Line, { type: "monotone", dataKey: "nominal", name: "Balance (Nominal)", stroke: "#0284C7", strokeWidth: 3, dot: false }),
          e(Line, { type: "monotone", dataKey: "real", name: "Balance (Real)", stroke: "#334155", strokeWidth: 3, dot: false, strokeDasharray: "6 6" }),
          e(ReferenceLine, {
            x: retireAge,
            stroke: "#EAB308",
            strokeWidth: 3,
            strokeDasharray: "6 3",
            ifOverflow: "extendDomain",
            label: { value: `Retirement ${retireAge}`, position: "insideTop", dy: 14, fill: "#EAB308", fontWeight: 700 },
          })
        )
      )
    );
  }

  function App() {
    const [initialBalance, setInitialBalance] = React.useState(150000);
    const [monthlyContribution, setMonthlyContribution] = React.useState(3000);
    const [preRetAnnual, setPreRetAnnual] = React.useState(8.0);
    const [postRetAnnual, setPostRetAnnual] = React.useState(5.0);
    const [inflationAnnual, setInflationAnnual] = React.useState(3.0);
    const [feesAnnual, setFeesAnnual] = React.useState(1.0);
    const [currentAge, setCurrentAge] = React.useState(40);
    const [retireAge, setRetireAge] = React.useState(60);
    const [lifeExpectancy, setLifeExpectancy] = React.useState(90);

    const proj = React.useMemo(
      () =>
        project({
          currentAge,
          retireAge,
          lifeExpectancy,
          initialBalance,
          monthlyContribution,
          preRetAnnual,
          postRetAnnual,
          inflationAnnual,
          feesAnnual,
        }),
      [
        currentAge,
        retireAge,
        lifeExpectancy,
        initialBalance,
        monthlyContribution,
        preRetAnnual,
        postRetAnnual,
        inflationAnnual,
        feesAnnual,
      ]
    );

    const reportRef = React.useRef(null);

    const downloadPNG = async () => {
      const node = reportRef.current;
      if (!node) return;
      const html2canvas = await ensureHtml2Canvas();
      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
      });
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "compound-interest-pro.png";
      a.click();
    };

    const downloadPDF = async () => {
      const node = reportRef.current;
      if (!node) return;
      const wasOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      await new Promise((r) => setTimeout(r, 50));
      const html2canvas = await ensureHtml2Canvas();
      const jspdf = await ensureJsPDF();
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
      const img = canvas.toDataURL("image/png");
      const jsPDF = jspdf.jsPDF;
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const maxW = pageWidth - margin * 2;
      const maxH = pageHeight - margin * 2;
      const pxPerMM = 96 / 25.4;
      const imgWmm = canvas.width / pxPerMM;
      const imgHmm = canvas.height / pxPerMM;
      const scale = Math.min(maxW / imgWmm, maxH / imgHmm, 1);
      const renderW = imgWmm * scale;
      const renderH = imgHmm * scale;
      pdf.addImage(
        img,
        "PNG",
        (pageWidth - renderW) / 2,
        (pageHeight - renderH) / 2,
        renderW,
        renderH,
        undefined,
        "FAST"
      );
      pdf.save("compound-interest-pro.pdf");
      document.body.style.overflow = wasOverflow;
    };

    const axisColor = (getComputedStyle(document.documentElement).getPropertyValue("--muted") || "#64748b").trim();

    return e(
      "div",
      { className: "wrap", ref: reportRef },
      e(
        "header",
        null,
        e(
          "div",
          null,
          e("h1", null, "Compound Interest Pro – The Ultimate Target"),
          e("div", { className: "muted" }, "Nominal & Real balances with sustainable retirement spending.")
        ),
        e(
          "div",
          { className: "legend" },
          e(
            "button",
            { className: "btn btn-sky", onClick: downloadPNG },
            "Download PNG Snapshot"
          ),
          e("button", { className: "btn btn-primary", onClick: downloadPDF }, "Download PDF")
        )
      ),
      e(
        "div",
        { className: "grid" },
        e(
          "div",
          { className: "card" },
          e(
            "div",
            { className: "row two" },
            e(MoneyInput, {
              label: "Starting Lump Sum (A$)",
              id: "start",
              value: initialBalance,
              onChange: (v) => setInitialBalance(clamp(v, 0, 50_000_000)),
            }),
            e(MoneyInput, {
              label: "Monthly Contribution (A$/mo)",
              id: "contrib",
              value: monthlyContribution,
              onChange: (v) => setMonthlyContribution(clamp(v, 0, 100_000)),
            })
          ),
          e(
            "div",
            { className: "row two" },
            e(PercentInput, {
              label: "Expected Return (% p.a., pre-retirement)",
              id: "pre",
              value: preRetAnnual,
              onChange: (v) => setPreRetAnnual(clamp(v, 0, 30)),
            }),
            e(PercentInput, {
              label: "Retirement Return (% p.a., post-retirement)",
              id: "post",
              value: postRetAnnual,
              onChange: (v) => setPostRetAnnual(clamp(v, 0, 30)),
            })
          ),
          e(
            "div",
            { className: "row two" },
            e(PercentInput, {
              label: "Inflation (% p.a.)",
              id: "infl",
              value: inflationAnnual,
              onChange: (v) => setInflationAnnual(clamp(v, 0, 15)),
            }),
            e(PercentInput, {
              label: "Fees (% p.a.)",
              id: "fees",
              value: feesAnnual,
              onChange: (v) => setFeesAnnual(clamp(v, 0, 5)),
            })
          ),
          e(
            "div",
            { className: "row two" },
            e(NumberInput, {
              label: "Current Age",
              id: "age",
              value: currentAge,
              onChange: (v) => setCurrentAge(clamp(v, 18, Math.min(109, retireAge - 1))),
              min: 18,
              max: 109,
            }),
            e(NumberInput, {
              label: "Retirement Age",
              id: "retAge",
              value: retireAge,
              onChange: (v) => setRetireAge(clamp(v, currentAge + 1, Math.min(109, lifeExpectancy - 1))),
              min: 19,
              max: 109,
            })
          ),
          e(
            "div",
            { className: "row" },
            e(NumberInput, {
              label: "Life Expectancy",
              id: "life",
              value: lifeExpectancy,
              onChange: (v) => setLifeExpectancy(clamp(v, retireAge + 1, 110)),
              min: retireAge + 1,
              max: 110,
            })
          ),
          e(
            "div",
            { className: "kpis", "aria-live": "polite" },
            e(
              "div",
              { className: "kpi" },
              e("div", { className: "lab" }, "Balance at Retirement (Nominal)"),
              e("div", { className: "val" }, fmtAUD(proj.retirement.balanceNominal))
            ),
            e(
              "div",
              { className: "kpi" },
              e("div", { className: "lab" }, "Balance at Retirement (Real)"),
              e("div", { className: "val" }, fmtAUD(proj.retirement.balanceReal))
            ),
            e(
              "div",
              { className: "kpi" },
              e("div", { className: "lab" }, "Sustainable Annual Spend (today $)"),
              e("div", { className: "val", style: { color: "var(--ok)" } }, fmtAUD(proj.retirement.sustainableAnnualToday))
            )
          )
        ),
        e(
          "div",
          { className: "card" },
          e(
            "div",
            { className: "legend", style: { marginBottom: 8 } },
            e(
              "span",
              { className: "chip" },
              e("span", { className: "dot", style: { background: "#0284C7" } }),
              "Nominal"
            ),
            e(
              "span",
              { className: "chip" },
              e("span", { className: "dot", style: { background: "#334155" } }),
              "Real"
            )
          ),
          e(ChartView, { data: proj.points, retireAge, axisColor }),
          e(
            "p",
            { className: "muted", style: { marginTop: 8 } },
            "Pre-retirement: contributions & growth net of fees. Post-retirement: inflation-indexed spending at a sustainable level, with net returns and fees applied."
          )
        )
      ),
      e(
        "footer",
        null,
        "© ",
        e("span", { id: "yr" }),
        " Compound Interest Pro"
      )
    );
  }

  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(e(App));
  document.getElementById("yr").textContent = String(new Date().getFullYear());

  try {
    const t = (a) => a.toLocaleString("en-AU");
    console.assert(t(1234567) === "1,234,567", "Locale thousands check failed");
    const demo = project({
      currentAge: 40,
      retireAge: 60,
      lifeExpectancy: 90,
      initialBalance: 200000,
      monthlyContribution: 3000,
      preRetAnnual: 8,
      postRetAnnual: 5,
      inflationAnnual: 3,
      feesAnnual: 1,
    });
    console.assert(Array.isArray(demo.points) && demo.points.length > 0, "Projection returned empty data");
    console.assert(demo.retirement.sustainableAnnualToday > 0, "Sustainable spend should be positive");
  } catch (e) {
    // keep UI resilient
  }
})();
