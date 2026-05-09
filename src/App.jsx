import { useState } from "react";

const FIELDS = [
  { name: "age",      label: "Age",          type: "number", hint: "years",             min: 1,  max: 120, step: 1,   defaultValue: 55 },
  { name: "sex",      label: "Sex",          type: "select", hint: "0=female, 1=male",  options: [{v:1,l:"Male"},{v:0,l:"Female"}], defaultValue: 1 },
  { name: "cp",       label: "Chest Pain",   type: "select", hint: "type 1-4",          options: [{v:1,l:"1 – Typical angina"},{v:2,l:"2 – Atypical angina"},{v:3,l:"3 – Non-anginal"},{v:4,l:"4 – Asymptomatic"}], defaultValue: 4 },
  { name: "trestbps", label: "Resting BP",   type: "number", hint: "mm Hg",             min: 80, max: 220, step: 1,   defaultValue: 130 },
  { name: "chol",     label: "Cholesterol",  type: "number", hint: "mg/dl",             min: 100,max: 600, step: 1,   defaultValue: 240 },
  { name: "fbs",      label: "Fasting BS",   type: "select", hint: "> 120 mg/dl",       options: [{v:0,l:"No"},{v:1,l:"Yes"}], defaultValue: 0 },
  { name: "restecg",  label: "Rest ECG",     type: "select", hint: "0-2",               options: [{v:0,l:"0 – Normal"},{v:1,l:"1 – ST-T abnormality"},{v:2,l:"2 – LV hypertrophy"}], defaultValue: 0 },
  { name: "thalach",  label: "Max Heart Rate",type:"number", hint: "bpm",               min: 60, max: 220, step: 1,   defaultValue: 150 },
  { name: "exang",    label: "Exercise Angina",type:"select",hint: "",                  options: [{v:0,l:"No"},{v:1,l:"Yes"}], defaultValue: 0 },
  { name: "oldpeak",  label: "ST Depression",type: "number", hint: "exercise vs rest",  min: 0,  max: 10,  step: 0.1, defaultValue: 1.0 },
  { name: "slope",    label: "ST Slope",     type: "select", hint: "1-3",               options: [{v:1,l:"1 – Upsloping"},{v:2,l:"2 – Flat"},{v:3,l:"3 – Downsloping"}], defaultValue: 2 },
  { name: "ca",       label: "Major Vessels",type: "select", hint: "0-3 (fluoroscopy)", options: [{v:0,l:"0"},{v:1,l:"1"},{v:2,l:"2"},{v:3,l:"3"}], defaultValue: 0 },
  { name: "thal",     label: "Thalassemia",  type: "select", hint: "",                  options: [{v:3,l:"3 – Normal"},{v:6,l:"6 – Fixed defect"},{v:7,l:"7 – Reversible defect"}], defaultValue: 3 },
];

const initialForm = Object.fromEntries(FIELDS.map((f) => [f.name, f.defaultValue]));

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function App() {
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: parseFloat(e.target.value) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      setResult(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isDiseased = result?.prediction === 1;

  return (
    <div className="app">
      <header>
        <h1>❤️ Heart Disease Risk Classifier</h1>
        <p>Enter patient vitals to get a prediction from the ML model</p>
      </header>

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="grid">
            {FIELDS.map((f) => (
              <div className="field" key={f.name}>
                <label htmlFor={f.name}>{f.label}</label>
                {f.type === "select" ? (
                  <select
                    id={f.name}
                    name={f.name}
                    value={form[f.name]}
                    onChange={handleChange}
                  >
                    {f.options.map((o) => (
                      <option key={o.v} value={o.v}>{o.l}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={f.name}
                    name={f.name}
                    type="number"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={form[f.name]}
                    onChange={handleChange}
                    required
                  />
                )}
                {f.hint && <span className="hint">{f.hint}</span>}
              </div>
            ))}
          </div>

          <button type="submit" disabled={loading}>
            {loading ? "Analysing…" : "Predict Risk"}
          </button>
        </form>

        {error && <div className="error">⚠️ {error}</div>}

        {result && (
          <div className={`result ${isDiseased ? "disease" : "no-disease"}`}>
            <div className="verdict">
              {isDiseased ? "⚠️ Heart Disease Detected" : "✅ No Heart Disease Detected"}
            </div>
            <div className="metrics">
              <div className="metric">
                <span>Confidence</span>
                <span>{(result.confidence * 100).toFixed(1)}%</span>
              </div>
              <div className="metric">
                <span>P(Disease)</span>
                <span>{(result.probability_disease * 100).toFixed(1)}%</span>
              </div>
              <div className="metric">
                <span>P(No Disease)</span>
                <span>{(result.probability_no_disease * 100).toFixed(1)}%</span>
              </div>
            </div>
            <div className="confidence-bar">
              <div
                className="confidence-fill"
                style={{ width: `${result.confidence * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <footer>UCI Heart Disease Dataset · BITS Pilani MLOps Assignment</footer>
    </div>
  );
}
