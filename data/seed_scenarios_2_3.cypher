// ── SCENARIO 2: Turkey-Syria Earthquake 2023 ─────────────

MERGE (n:Scenario {id: "turkey_eq_2023"})
SET n.name = "Turkey-Syria Earthquake 2023",
    n.year = 2023,
    n.location = "Kahramanmaras, Turkey",
    n.deaths = 59000,
    n.damage_usd = 34000000000,
    n.description = "Deadliest earthquake in Turkish history";

MERGE (n:Hazard {id: "hazard_eq_turkey"})
SET n.name = "7.8M Kahramanmaras Earthquake",
    n.type = "earthquake",
    n.severity = 10,
    n.magnitude = 7.8,
    n.region = "Southeast Turkey";

MERGE (n:Event {id: "event_collapse_turkey"})
SET n.name = "Mass Building Collapse",
    n.buildings_down = 50000,
    n.affected_population = 150000;

MERGE (n:Event {id: "event_trapped_turkey"})
SET n.name = "Mass Casualties Trapped Under Rubble",
    n.people = 150000,
    n.rescue_window_hrs = 72;

MERGE (n:Hazard {id: "hazard_aftershock_turkey"})
SET n.name = "7.7M Aftershock",
    n.type = "earthquake",
    n.severity = 9,
    n.magnitude = 7.7,
    n.delay_hrs_after_main = 9;

MERGE (n:Resource {id: "resource_hospital_turkey"})
SET n.name = "Regional Hospital Network",
    n.status = "partially_collapsed",
    n.capacity = 5000,
    n.surge_patients = 18000;

MERGE (n:Failure {id: "failure_gas_turkey"})
SET n.name = "Gas Main Rupture & Fires",
    n.probability = 0.82,
    n.fires_started = 37,
    n.recovery_hrs = 96;

MERGE (n:Infrastructure {id: "infra_roads_turkey"})
SET n.name = "Highway Access Network",
    n.status = "blocked",
    n.roads_destroyed = 12;

// Turkey relationships
MATCH (a:Hazard {id:"hazard_eq_turkey"}),
      (b:Event  {id:"event_collapse_turkey"})
MERGE (a)-[:TRIGGERS {prob:0.98, delay_hrs:0,
  mechanism:"Ground shaking collapses buildings in seconds"}]->(b);

MATCH (a:Event {id:"event_collapse_turkey"}),
      (b:Event {id:"event_trapped_turkey"})
MERGE (a)-[:CAUSES {prob:0.90, delay_hrs:0,
  mechanism:"People inside collapsed structures become trapped"}]->(b);

MATCH (a:Hazard  {id:"hazard_eq_turkey"}),
      (b:Failure {id:"failure_gas_turkey"})
MERGE (a)-[:RUPTURES {prob:0.77, delay_hrs:0,
  mechanism:"Ground displacement breaks underground gas lines"}]->(b);

MATCH (a:Failure  {id:"failure_gas_turkey"}),
      (b:Resource {id:"resource_hospital_turkey"})
MERGE (a)-[:OVERWHELMS {prob:0.85, delay_hrs:2,
  mechanism:"Gas fire casualties flood already-damaged hospitals"}]->(b);

MATCH (a:Hazard {id:"hazard_eq_turkey"}),
      (b:Hazard {id:"hazard_aftershock_turkey"})
MERGE (a)-[:TRIGGERS {prob:0.60, delay_hrs:9,
  mechanism:"Stress redistribution causes second major rupture"}]->(b);

MATCH (a:Hazard {id:"hazard_aftershock_turkey"}),
      (b:Event  {id:"event_collapse_turkey"})
MERGE (a)-[:WORSENS {prob:0.88, delay_hrs:0,
  mechanism:"Second quake collapses structures weakened by first"}]->(b);

MATCH (a:Hazard         {id:"hazard_eq_turkey"}),
      (b:Infrastructure {id:"infra_roads_turkey"})
MERGE (a)-[:DESTROYS {prob:0.71, delay_hrs:0,
  mechanism:"Bridge and road collapse isolates rescue teams"}]->(b);

MATCH (a:Infrastructure {id:"infra_roads_turkey"}),
      (b:Event           {id:"event_trapped_turkey"})
MERGE (a)-[:DELAYS {prob:0.93, delay_hrs:6,
  mechanism:"Rescue teams cannot reach trapped survivors"}]->(b);

// Turkey CONTAINS
MATCH (sc:Scenario {id:"turkey_eq_2023"}), (n:Hazard {id:"hazard_eq_turkey"})
MERGE (sc)-[:CONTAINS]->(n);

MATCH (sc:Scenario {id:"turkey_eq_2023"}), (n:Event {id:"event_collapse_turkey"})
MERGE (sc)-[:CONTAINS]->(n);

MATCH (sc:Scenario {id:"turkey_eq_2023"}), (n:Event {id:"event_trapped_turkey"})
MERGE (sc)-[:CONTAINS]->(n);

MATCH (sc:Scenario {id:"turkey_eq_2023"}), (n:Hazard {id:"hazard_aftershock_turkey"})
MERGE (sc)-[:CONTAINS]->(n);

MATCH (sc:Scenario {id:"turkey_eq_2023"}), (n:Resource {id:"resource_hospital_turkey"})
MERGE (sc)-[:CONTAINS]->(n);

MATCH (sc:Scenario {id:"turkey_eq_2023"}), (n:Failure {id:"failure_gas_turkey"})
MERGE (sc)-[:CONTAINS]->(n);

MATCH (sc:Scenario {id:"turkey_eq_2023"}), (n:Infrastructure {id:"infra_roads_turkey"})
MERGE (sc)-[:CONTAINS]->(n);


// ── SCENARIO 3: Pakistan Floods 2022 ─────────────────────

MERGE (n:Scenario {id: "pakistan_floods_2022"})
SET n.name = "Pakistan Monsoon Floods 2022",
    n.year = 2022,
    n.location = "Sindh & Balochistan, Pakistan",
    n.deaths = 1739,
    n.damage_usd = 30000000000,
    n.description = "One-third of Pakistan submerged. 33M people affected.";

MERGE (n:Hazard {id: "hazard_rainfall_pakistan"})
SET n.name = "Extreme Monsoon Rainfall",
    n.type = "flood",
    n.severity = 9,
    n.region = "Pakistan",
    n.rainfall_mm = 784,
    n.area_km2 = 160000;

MERGE (n:Event {id: "event_flood_pakistan"})
SET n.name = "Nationwide Flash Flooding",
    n.affected_population = 33000000,
    n.area_submerged_pct = 33;

MERGE (n:Failure {id: "failure_crops_pakistan"})
SET n.name = "Crop & Food Supply Destruction",
    n.probability = 0.95,
    n.crops_destroyed_pct = 40,
    n.recovery_hrs = 8760;

MERGE (n:Event {id: "event_disease_pakistan"})
SET n.name = "Waterborne Disease Outbreak",
    n.affected_population = 650000,
    n.diseases = "cholera, malaria, dengue";

MERGE (n:Infrastructure {id: "infra_bridges_pakistan"})
SET n.name = "Road and Bridge Network",
    n.status = "destroyed",
    n.bridges_destroyed = 5000,
    n.roads_destroyed_km = 13000;

MERGE (n:Resource {id: "resource_hospital_pakistan"})
SET n.name = "Rural Health Centers",
    n.status = "flooded",
    n.centers_destroyed = 1460;

// Pakistan relationships
MATCH (a:Hazard {id:"hazard_rainfall_pakistan"}),
      (b:Event  {id:"event_flood_pakistan"})
MERGE (a)-[:CAUSES {prob:0.97, delay_hrs:6,
  mechanism:"Extreme rainfall saturates soil and overflows rivers"}]->(b);

MATCH (a:Event         {id:"event_flood_pakistan"}),
      (b:Infrastructure {id:"infra_bridges_pakistan"})
MERGE (a)-[:DESTROYS {prob:0.88, delay_hrs:12,
  mechanism:"Floodwaters wash out roads and bridges across regions"}]->(b);

MATCH (a:Event {id:"event_flood_pakistan"}),
      (b:Event {id:"event_disease_pakistan"})
MERGE (a)-[:CAUSES {prob:0.95, delay_hrs:24,
  mechanism:"Standing water contaminates drinking water sources"}]->(b);

MATCH (a:Event   {id:"event_flood_pakistan"}),
      (b:Failure {id:"failure_crops_pakistan"})
MERGE (a)-[:DESTROYS {prob:0.95, delay_hrs:48,
  mechanism:"Crops submerged for weeks causing total harvest loss"}]->(b);

MATCH (a:Event    {id:"event_flood_pakistan"}),
      (b:Resource {id:"resource_hospital_pakistan"})
MERGE (a)-[:FLOODS {prob:0.76, delay_hrs:8,
  mechanism:"Floodwaters enter and destroy rural health facilities"}]->(b);

MATCH (a:Event    {id:"event_disease_pakistan"}),
      (b:Resource {id:"resource_hospital_pakistan"})
MERGE (a)-[:OVERWHELMS {prob:0.82, delay_hrs:72,
  mechanism:"Disease outbreak sends thousands to destroyed hospitals"}]->(b);

MATCH (a:Infrastructure {id:"infra_bridges_pakistan"}),
      (b:Event           {id:"event_disease_pakistan"})
MERGE (a)-[:WORSENS {prob:0.89, delay_hrs:0,
  mechanism:"Destroyed roads block aid delivery and medical response"}]->(b);

// Pakistan CONTAINS
MATCH (sc:Scenario {id:"pakistan_floods_2022"}), (n:Hazard {id:"hazard_rainfall_pakistan"})
MERGE (sc)-[:CONTAINS]->(n);

MATCH (sc:Scenario {id:"pakistan_floods_2022"}), (n:Event {id:"event_flood_pakistan"})
MERGE (sc)-[:CONTAINS]->(n);

MATCH (sc:Scenario {id:"pakistan_floods_2022"}), (n:Failure {id:"failure_crops_pakistan"})
MERGE (sc)-[:CONTAINS]->(n);

MATCH (sc:Scenario {id:"pakistan_floods_2022"}), (n:Event {id:"event_disease_pakistan"})
MERGE (sc)-[:CONTAINS]->(n);

MATCH (sc:Scenario {id:"pakistan_floods_2022"}), (n:Infrastructure {id:"infra_bridges_pakistan"})
MERGE (sc)-[:CONTAINS]->(n);

MATCH (sc:Scenario {id:"pakistan_floods_2022"}), (n:Resource {id:"resource_hospital_pakistan"})
MERGE (sc)-[:CONTAINS]->(n);