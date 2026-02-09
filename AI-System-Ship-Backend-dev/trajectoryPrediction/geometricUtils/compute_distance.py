import math

def haversine_m(point1, point2):
    lat1, lon1 = point1
    lat2, lon2 = point2
    # degrees -> radians
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))

    R = 6371000.0  # Earth radius in meters
    return R * c


if __name__ == "__main__":
    # Basic self-tests
    p = (0.0, 0.0)
    assert abs(haversine_m(p, p)) < 1e-6

    # ~1 degree longitude at equator ~111.19 km
    p1 = (0.0, 0.0)
    p2 = (0.0, 1.0)
    d = haversine_m(p1, p2)
    print(d)
    assert abs(d - 111194.926) < 250.0

    # ~1 degree longitude at 60°N should be ~cos(60°) of equator distance
    p3 = (60.0, 0.0)
    p4 = (60.0, 1.0)
    d60 = haversine_m(p3, p4)
    expected60 = 111194.926 * math.cos(math.radians(60.0))
    print(d60, expected60)
    assert abs(d60 - expected60) < 250.0

    # Symmetry
    a = (37.7749, -122.4194)
    b = (34.0522, -118.2437)
    assert abs(haversine_m(a, b) - haversine_m(b, a)) < 1e-6
