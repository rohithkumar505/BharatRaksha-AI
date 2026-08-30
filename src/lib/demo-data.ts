export const riskDemo = {
  location: "Assam (Demo District)",
  overallScore: 72,
  level: "High" as const,
  updatedAt: "Live demo",
  hazards: [
    { name: "Flood", score: 84, level: "Critical" },
    { name: "Cyclone", score: 41, level: "Moderate" },
    { name: "Landslide", score: 28, level: "Low" },
    { name: "Earthquake", score: 35, level: "Moderate" },
    { name: "Heatwave", score: 22, level: "Low" },
    { name: "Drought", score: 18, level: "Low" },
  ],
  weather: {
    tempC: 29,
    rainfallMm: 62,
    humidity: 91,
    windKph: 24,
    condition: "Heavy showers",
  },
};

export const shelters = [
  {
    id: "s1",
    name: "District School Relief Camp",
    distanceKm: 1.2,
    occupancy: 62,
    capacity: 400,
    status: "Open",
  },
  {
    id: "s2",
    name: "Community Hall Zone B",
    distanceKm: 2.4,
    occupancy: 41,
    capacity: 220,
    status: "Open",
  },
  {
    id: "s3",
    name: "Panchayat Evacuation Center",
    distanceKm: 3.1,
    occupancy: 88,
    capacity: 180,
    status: "Near Full",
  },
];

export const hospitals = [
  {
    id: "h1",
    name: "Civil Hospital Zone A",
    distanceKm: 2.1,
    specialty: "Trauma / Emergency",
    status: "Open",
  },
  {
    id: "h2",
    name: "District Medical College",
    distanceKm: 4.5,
    specialty: "Multi-specialty",
    status: "Open",
  },
  {
    id: "h3",
    name: "PHC Riverside",
    distanceKm: 1.6,
    specialty: "Primary care",
    status: "Limited",
  },
];

export const bloodBanks = [
  { name: "District Blood Bank", groups: "A+, B+, O+, AB+", distanceKm: 2.8 },
  { name: "Red Cross Camp Unit", groups: "O+, B+", distanceKm: 3.4 },
];

export const medicines = [
  { name: "ORS packets", place: "Relief Camp A", stock: "Available" },
  { name: "Antibiotics", place: "Civil Hospital", stock: "Limited" },
  { name: "Antipyretics", place: "PHC Riverside", stock: "Available" },
];

export const helplines = [
  { name: "National Emergency", number: "112" },
  { name: "NDRF Helpline", number: "9711077372" },
  { name: "Disaster Control Room (Demo)", number: "1070" },
  { name: "Ambulance", number: "108" },
];

export const resources = [
  { item: "Drinking water kits", zone: "Zone A", status: "Dispatched", qty: 1200 },
  { item: "Medical supplies", zone: "Zone C", status: "In transit", qty: 340 },
  { item: "Rescue boats", zone: "River belt", status: "Assigned", qty: 18 },
  { item: "Food packets", zone: "Zone B", status: "Stocked", qty: 5000 },
];

export const rescueTeams = [
  { name: "NDRF Unit 1", zone: "River belt", status: "Active", members: 24 },
  { name: "SDRF Squad B", zone: "Zone A", status: "Active", members: 16 },
  { name: "Volunteer Boat Team", zone: "Zone C", status: "Standby", members: 12 },
];

export const incidents = [
  {
    id: "i1",
    type: "Flooded road",
    place: "NH Bypass near market",
    status: "Verified",
    time: "12 min ago",
  },
  {
    id: "i2",
    type: "Shelter request",
    place: "Ward 4 riverside",
    status: "Open",
    time: "28 min ago",
  },
  {
    id: "i3",
    type: "Missing person report",
    place: "Zone B camp area",
    status: "Investigating",
    time: "1 hr ago",
  },
];

export const schemes = [
  {
    name: "State Disaster Relief Assistance",
    for: "Flood-affected households",
    docs: "ID, residence proof, damage photos",
  },
  {
    name: "PM Fasal Bima guidance",
    for: "Crop loss due to flood",
    docs: "Land record, crop photos, claim form",
  },
  {
    name: "Emergency medical support pathways",
    for: "Injury / hospitalization",
    docs: "Hospital slip, ID, medical notes",
  },
];

export const contactsSeed = [
  { name: "Family Primary", phone: "+91 98XXXXXX01", priority: 1 },
  { name: "Local Volunteer Lead", phone: "+91 98XXXXXX22", priority: 2 },
];
