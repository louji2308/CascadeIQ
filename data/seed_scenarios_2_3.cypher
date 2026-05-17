// ── SCENARIO 2: Turkey-Syria Earthquake 2023 ─────────────
MERGE (sc2:Scenario {
  id: "turkey_eq_2023",
  name: "Turkey-Syria Earthquake 2023",
  year: 2023,
  location: "Kahramanmaras, Turkey",
  deaths: 59000,
  damage_usd: 34000000000,
  description: "Deadliest earthquake in Turkish history"
});

MERGE (eq:Hazard {
  id: "hazard_eq_turkey",
  name: "7.8M Kahramanmaras Earthquake",
  type: "earthquake",
  severity: 10,
  magnitude: 7.8,
  region: "Southeast Turkey"
});

MERGE (collapse:Event {
  id: "event_collapse_turkey",
  name: "Mass Building Collapse",
  buildings_down: 50000,
  affected_population: 150000
});

MERGE (trapped:Event {
  id: "event_trapped_turkey",
  name: "Mass Casualties Trapped Under Rubble",
  people: 150000,
  rescue_window_hrs: 72
});

MERGE (aftershock:Hazard {
  id: "hazard_aftershock_turkey",
  name: "7.7M Aftershock",
  type: "earthquake",
  severity: 9,
  magnitude: 7.7,
  delay_hrs_after_main: 9
});

MERGE (hosp_t:Resource {
  id: "resource_hospital_turkey",
  name: "Regional Hospital Network",
  status: "partially_collapsed",
  capacity: 5000,
  surge_patients: 18000
});

MERGE (gas_t:Failure {
  id: "failure_gas_turkey",
  name: "Gas Main Rupture & Fires",
  probability: 0.82,
  fires_started: 37,
  recovery_hrs: 96
});

MERGE (roads_t:Infrastructure {
  id: "infra_roads_turkey",
  name: "Highway Access Network",
  status: "blocked",
  roads_destroyed: 12
});

// Relationships
MERGE (eq)-[:TRIGGERS {prob:0.98, delay_hrs:0, mechanism:"Ground shaking collapses buildings in seconds"}]->(collapse);
MERGE (collapse)-[:CAUSES {prob:0.90, delay_hrs:0, mechanism:"People inside collapsed structures become trapped"}]->(trapped);
MERGE (eq)-[:RUPTURES {prob:0.77, delay_hrs:0, mechanism:"Ground displacement breaks underground gas lines"}]->(gas_t);
MERGE (gas_t)-[:OVERWHELMS {prob:0.85, delay_hrs:2, mechanism:"Gas fire casualties flood already-damaged hospitals"}]->(hosp_t);
MERGE (eq)-[:TRIGGERS {prob:0.60, delay_hrs:9, mechanism:"Stress redistribution causes second major rupture"}]->(aftershock);
MERGE (aftershock)-[:WORSENS {prob:0.88, delay_hrs:0, mechanism:"Second quake collapses structures weakened by first"}]->(collapse);
MERGE (eq)-[:DESTROYS {prob:0.71, delay_hrs:0, mechanism:"Bridge and road collapse isolates rescue teams"}]->(roads_t);
MERGE (roads_t)-[:DELAYS {prob:0.93, delay_hrs:6, mechanism:"Rescue teams cannot reach trapped survivors"}]->(trapped);

// Link to scenario
MERGE (sc2)-[:CONTAINS]->(eq);
MERGE (sc2)-[:CONTAINS]->(collapse);
MERGE (sc2)-[:CONTAINS]->(trapped);
MERGE (sc2)-[:CONTAINS]->(aftershock);
MERGE (sc2)-[:CONTAINS]->(hosp_t);
MERGE (sc2)-[:CONTAINS]->(gas_t);
MERGE (sc2)-[:CONTAINS]->(roads_t);

// ── SCENARIO 3: Pakistan Floods 2022 ─────────────────────
MERGE (sc3:Scenario {
  id: "pakistan_floods_2022",
  name: "Pakistan Monsoon Floods 2022",
  year: 2022,
  location: "Sindh & Balochistan, Pakistan",
  deaths: 1739,
  damage_usd: 30000000000,
  description: "One-third of Pakistan submerged. 33M people affected."
});

MERGE (rain:Hazard {
  id: "hazard_rainfall_pakistan",
  name: "Extreme Monsoon Rainfall",
  type: "flood",
  severity: 9,
  region: "Pakistan",
  rainfall_mm: 784,
  area_km2: 160000
});

MERGE (flood:Event {
  id: "event_flood_pakistan",
  name: "Nationwide Flash Flooding",
  affected_population: 33000000,
  area_submerged_pct: 33
});

MERGE (crops:Failure {
  id: "failure_crops_pakistan",
  name: "Crop & Food Supply Destruction",
  probability: 0.95,
  crops_destroyed_pct: 40,
  recovery_hrs: 8760
});

MERGE (disease:Event {
  id: "event_disease_pakistan",
  name: "Waterborne Disease Outbreak",
  affected_population: 650000,
  diseases: "cholera, malaria, dengue"
});

MERGE (infra_pak:Infrastructure {
  id: "infra_bridges_pakistan",
  name: "Road and Bridge Network",
  status: "destroyed",
  bridges_destroyed: 5000,
  roads_destroyed_km: 13000
});

MERGE (hosp_p:Resource {
  id: "resource_hospital_pakistan",
  name: "Rural Health Centers",
  status: "flooded",
  centers_destroyed: 1460
});

// Relationships
MERGE (rain)-[:CAUSES {prob:0.97, delay_hrs:6, mechanism:"Extreme rainfall saturates soil and overflows rivers"}]->(flood);
MERGE (flood)-[:DESTROYS {prob:0.88, delay_hrs:12, mechanism:"Floodwaters wash out roads and bridges across regions"}]->(infra_pak);
MERGE (flood)-[:CAUSES {prob:0.95, delay_hrs:24, mechanism:"Standing water contaminates drinking water sources"}]->(disease);
MERGE (flood)-[:DESTROYS {prob:0.95, delay_hrs:48, mechanism:"Crops submerged for weeks causing total harvest loss"}]->(crops);
MERGE (flood)-[:FLOODS {prob:0.76, delay_hrs:8, mechanism:"Floodwaters enter and destroy rural health facilities"}]->(hosp_p);
MERGE (disease)-[:OVERWHELMS {prob:0.82, delay_hrs:72, mechanism:"Disease outbreak sends thousands to destroyed hospitals"}]->(hosp_p);
MERGE (infra_pak)-[:WORSENS {prob:0.89, delay_hrs:0, mechanism:"Destroyed roads block aid delivery and medical response"}]->(disease);

// Link to scenario
MERGE (sc3)-[:CONTAINS]->(rain);
MERGE (sc3)-[:CONTAINS]->(flood);
MERGE (sc3)-[:CONTAINS]->(crops);
MERGE (sc3)-[:CONTAINS]->(disease);
MERGE (sc3)-[:CONTAINS]->(infra_pak);
MERGE (sc3)-[:CONTAINS]->(hosp_p);