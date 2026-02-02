SHIP_DATA = [
	{
		id: "mmsi-12345678",
		name: "MMSI 12345678",
		mmsi: "12345678",
		coords: { lat: 16.782, lng: 114.512 },  
		threat: { 
			score: 90, 
			level: "高風險",
			smuggleAISAnomaly: 2,
			anomalyHover: 1,
			shipsTooClose: 2,
		},
		
		ais: {
		status: "未開啟",
		shipType: "貨輪",
		name: "Vessel A",
		imo: "IMO1234567",
		navigation: "Under way using engine",
		cog: "216.5°",
		sog: "9.8 節"
		},

		rf: {
		frequency: "162.135 MHz",
		location: "16.782°N, 114.512°E",
		accuracyLevel: "高",
		timestamp: "16:27Z",
		pulseWidth: "125 ns",
		pulseRepetitionFrequency: "850 Hz",  
		waveShape: "脈衝波",
		},
	},
];
