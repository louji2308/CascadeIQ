// ── SCENARIO CONTAINER ──────────────────────────────────
MERGE (sc:Scenario {
  id: "lahaina_2023",
  name: "Lahaina Wildfire 2023",
  year: 2023,
  location: "Maui, Hawaii, USA",
  deaths: 100,
  damage_usd: 5500000000,
  description: "Deadliest US wildfire in over a century"
});

// ── NODES ───────────────────────────────────────────────
MERGE (w:Hazard {
  id: "hazard_wildfire_lahaina",
  name: "Lahaina Wildfire",
  type: "wildfire",
  severity: 9,
  region: "Maui, Hawaii",
  area_acres: 2170,
  wind_speed_mph: 67,
  started: "2023-08-08"
});

MERGE (evac:Event {
  id: "event_evacuation_lahaina",
  name: "Mass Evacuation Order",
  affected_population: 12000,
  gridlock: true,
  delay_minutes: 180
});

MERGE (air:Hazard {
  id: "hazard_smoke_lahaina",
  name: "Toxic Smoke & Air Pollution",
  type: "air_quality",
  severity: 8,
  aqi: 342,
  pm25_ugm3: 290
});

MERGE (hosp:Resource {
  id: "resource_hospital_maui",
  name: "Maui Memorial Medical Center",
  capacity: 220,
  surge_patients: 418,
  backup_power: false
});

MERGE (power:Infrastructure {
  id: "infra_power_maui",
  name: "Maui Power Grid",
  capacity_mw: 200,
  load_pct: 96,
  lines_down: 23
});

MERGE (comms:Failure {
  id: "failure_comms_lahaina",
  name: "Emergency Communications Failure",
  probability: 0.89,
  systems_down: "911, cell towers, sirens",
  recovery_hrs: 48
});

MERGE (roads:Infrastructure {
  id: "infra_roads_lahaina",
  name: "Front Street Corridor",
  status: "blocked",
  vehicles_trapped: 1400
});

// ── CASCADE RELATIONSHIPS ────────────────────────────────
MERGE (w)-[:TRIGGERS {
  prob: 0.97, delay_hrs: 1,
  mechanism: "Rapid fire spread forces evacuation orders"
}]->(evac);

MERGE (w)-[:CAUSES {
  prob: 0.99, delay_hrs: 0,
  mechanism: "Combustion releases PM2.5 and toxic gases"
}]->(air);

MERGE (w)-[:DESTROYS {
  prob: 0.85, delay_hrs: 2,
  mechanism: "Fire burns through power line corridors"
}]->(power);

MERGE (evac)-[:BLOCKS {
  prob: 0.91, delay_hrs: 0,
  mechanism: "12,000 people on single-lane road creates gridlock"
}]->(roads);

MERGE (evac)-[:OVERWHELMS {
  prob: 0.78, delay_hrs: 4,
  mechanism: "Burn victims and displaced persons exceed capacity"
}]->(hosp);

MERGE (air)-[:STRAINS {
  prob: 0.65, delay_hrs: 6,
  mechanism: "Respiratory emergencies surge hospital admissions"
}]->(hosp);

MERGE (power)-[:TRIGGERS {
  prob: 0.89, delay_hrs: 3,
  mechanism: "Power loss takes down cell towers and 911 systems"
}]->(comms);

MERGE (hosp)-[:WORSENED_BY {
  prob: 0.73, delay_hrs: 5,
  mechanism: "No backup power means life-support equipment fails"
}]->(power);

// ── LINK NODES TO SCENARIO ───────────────────────────────
MERGE (sc)-[:CONTAINS]->(w);
MERGE (sc)-[:CONTAINS]->(evac);
MERGE (sc)-[:CONTAINS]->(air);
MERGE (sc)-[:CONTAINS]->(hosp);
MERGE (sc)-[:CONTAINS]->(power);
MERGE (sc)-[:CONTAINS]->(comms);
MERGE (sc)-[:CONTAINS]->(roads);