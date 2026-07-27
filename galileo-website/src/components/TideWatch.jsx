import React, { useEffect, useState } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import Navbar from "../components/Navbar";
import {
  listAois,
  createAoi,
  getAoiActivity,
  listReports,
  createReport,
  analyzeReport,
  getUsage,
} from "../api/client";
import "./TideWatch.css";

// Inline sparkline for a vessel-count series (no chart dependency).
function Sparkline({ series }) {
  if (!series || series.length < 2) return <span className="tw-muted">n/a</span>;
  const counts = series.map((p) => p.vesselCount);
  const max = Math.max(...counts, 1);
  const min = Math.min(...counts, 0);
  const span = max - min || 1;
  const w = 240;
  const h = 40;
  const pts = counts
    .map((c, i) => {
      const x = (i / (counts.length - 1)) * w;
      const y = h - ((c - min) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="tw-spark" width={w} height={h} role="img" aria-label="activity">
      <polyline points={pts} fill="none" stroke="#4fd1c5" strokeWidth="2" />
    </svg>
  );
}

function Console() {
  const [aois, setAois] = useState([]);
  const [usage, setUsage] = useState(null);
  const [reports, setReports] = useState([]);
  const [activity, setActivity] = useState(null);
  const [selected, setSelected] = useState(null);
  const [newAoiName, setNewAoiName] = useState("");
  const [newReportTitle, setNewReportTitle] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [a, u, r] = await Promise.all([
          listAois(),
          getUsage(),
          listReports(),
        ]);
        setAois(a.aois || []);
        setUsage((u.usage && u.usage[0]) || null);
        setReports(r.reports || []);
      } catch (e) {
        setError(String(e.message || e));
      }
    })();
  }, []);

  const handleCreateAoi = async () => {
    if (!newAoiName.trim()) return;
    try {
      // Minimal AOI; a real map picker supplies geometry (MissionPlanner).
      const aoi = await createAoi({
        name: newAoiName.trim(),
        geometry: { type: "Polygon", coordinates: [] },
        alertRules: [{ id: "r1", type: "surge_pct", threshold: 40 }],
      });
      setAois((prev) => [...prev, aoi]);
      setNewAoiName("");
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  const handleSelect = async (aoi) => {
    setSelected(aoi);
    setActivity(null);
    try {
      setActivity(await getAoiActivity(aoi.aoiId));
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  const handleCreateReport = async () => {
    if (!newReportTitle.trim()) return;
    try {
      const rep = await createReport({
        title: newReportTitle.trim(),
        aoiIds: selected ? [selected.aoiId] : [],
        promptText: "Summarize recent vessel activity for the selected AOIs.",
      });
      setReports((prev) => [...prev, rep]);
      setNewReportTitle("");
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  const handleAnalyze = async (reportId) => {
    try {
      const updated = await analyzeReport(reportId);
      setReports((prev) =>
        prev.map((r) => (r.reportId === reportId ? updated : r))
      );
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  return (
    <div className="tw-console">
      <h1 className="tw-title">TideWatch Console</h1>
      {error && <div className="tw-error">Error: {error}</div>}

      {usage && (
        <div className="tw-usage">
          <span>Scenes analyzed: {usage.scenesAnalyzed}</span>
          <span>Reports: {usage.reportsGenerated}</span>
          <span>AOIs: {usage.aoiCount}</span>
        </div>
      )}

      <div className="tw-grid">
        <section className="tw-card">
          <h2>Areas of Interest</h2>
          <ul className="tw-list">
            {aois.map((a) => (
              <li key={a.aoiId}>
                <button className="tw-link" onClick={() => handleSelect(a)}>
                  {a.name}
                </button>
              </li>
            ))}
            {aois.length === 0 && <li className="tw-muted">No AOIs yet.</li>}
          </ul>
          <div className="tw-row">
            <input
              value={newAoiName}
              onChange={(e) => setNewAoiName(e.target.value)}
              placeholder="New AOI name"
            />
            <button onClick={handleCreateAoi}>Add</button>
          </div>
        </section>

        <section className="tw-card">
          <h2>Activity {selected ? `— ${selected.name}` : ""}</h2>
          {!selected && <p className="tw-muted">Select an AOI.</p>}
          {selected && activity && (
            <div>
              <Sparkline series={activity.series} />
              <p>
                Latest: <strong>{activity.latestVesselCount ?? "n/a"}</strong>{" "}
                vessels &nbsp;|&nbsp; WoW delta:{" "}
                <strong>{activity.weekOverWeekDelta ?? "n/a"}</strong>{" "}
                ({activity.weekOverWeekPct ?? "n/a"}%)
              </p>
            </div>
          )}
        </section>

        <section className="tw-card">
          <h2>Reports</h2>
          <ul className="tw-list">
            {reports.map((r) => (
              <li key={r.reportId}>
                <strong>{r.title}</strong> [{r.status}]{" "}
                {r.status !== "ANALYZED" && (
                  <button onClick={() => handleAnalyze(r.reportId)}>
                    Analyze
                  </button>
                )}
                {r.analysis && <p className="tw-analysis">{r.analysis}</p>}
              </li>
            ))}
            {reports.length === 0 && <li className="tw-muted">No reports.</li>}
          </ul>
          <div className="tw-row">
            <input
              value={newReportTitle}
              onChange={(e) => setNewReportTitle(e.target.value)}
              placeholder="New report title"
            />
            <button onClick={handleCreateReport}>Create</button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function TideWatchPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="tw-page">
      <Navbar
        isMenuOpen={menuOpen}
        setIsMenuOpen={setMenuOpen}
        toggleMenu={() => setMenuOpen((v) => !v)}
      />
      <Authenticator>{() => <Console />}</Authenticator>
    </div>
  );
}
