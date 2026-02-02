#!/usr/bin/env python3
"""
Global Fishing Watch API - 簡化版
只做一件事：擷取船隻資料
"""

import requests
import json

# ============================================================
# 在此設定你的 API Token
# ============================================================
API_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtpZEtleSJ9.eyJkYXRhIjp7Im5hbWUiOiJhaSBzaGlwIHN5c3RlbSIsInVzZXJJZCI6NTEwNDIsImFwcGxpY2F0aW9uTmFtZSI6ImFpIHNoaXAgc3lzdGVtIiwiaWQiOjMzNDksInR5cGUiOiJ1c2VyLWFwcGxpY2F0aW9uIn0sImlhdCI6MTc1OTIyMDE5OSwiZXhwIjoyMDc0NTgwMTk5LCJhdWQiOiJnZnciLCJpc3MiOiJnZncifQ.d4KcluNIxEh5veVMUKFjdIQh0VMg-vBtOBuG3cqHW8BNdYynPFRhwfemk1OU2dfrdGNmBnz-25NTKJ07QkPZQfbqWU2taNi-qQOAcwNIdU8lkSJQwi0IehnEJW7G9knlBJ2IwmS-9XQD7-lfcIy5y99sh4Upj5VSV-e_Fd11GlOvipjhtZkhCt4gmkSxiqsKdYT2L-qG79RYCvn-MVGCsi_VpsScbal_3O0wHcy7dejFqJZ7Uq3TQHfF6VP2v5v7430NF0Fr6ZecWofWLEmxyPsvnRGTo5DC0rWCJqydaiUC7p0tuA-vkSDzSURgWkLpblD-NiFpI17JTx25m3zNfKzaQAHmAG6vPZCUcf6hhfCgH7PvFNJF_f6SPXoRo_N3htxeUaFpQLuedX8CC6mBoOiWCKENDscCp0pQUuYoMPZvitQlsazaMRua45Jcc5c2ueJ9csjW7Vmdeypbx_j-obloUnjoixtSHUqdR_2u83r7RMwSnhHgEbYQtBoP69Tb"  # 請替換為你的實際 Token
# ============================================================


def search_vessel(mmsi):
    """搜尋船隻"""
    url = "https://gateway.api.globalfishingwatch.org/v3/vessels/search"
    headers = {"Authorization": f"Bearer {API_TOKEN}"}
    params = {
        "query": mmsi,
        "datasets[0]": "public-global-vessel-identity:latest"
    }

    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()
    return response.json()


def get_vessel_events(vessel_id, start_date="2024-01-01T00:00:00Z"):
    """取得船隻事件"""
    url = "https://gateway.api.globalfishingwatch.org/v3/events"
    headers = {"Authorization": f"Bearer {API_TOKEN}"}
    params = {
        "vessels[0]": vessel_id,
        "datasets[0]": "public-global-fishing-events:latest",
        "start-date": start_date,
        "offset": 0,
        "limit": 100
    }

    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        return response.json()
    except:
        return {"entries": []}


def save_json(data, filename):
    """儲存為 JSON"""
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"✅ 已儲存: {filename}")


if __name__ == '__main__':
    # 搜尋船隻
    print("\n=== 搜尋船隻 ===")
    mmsi = "412440692"  # 改成你要查詢的 MMSI

    vessels = search_vessel(mmsi)
    print(f"找到 {len(vessels.get('entries', []))} 艘船")

    # 儲存結果
    save_json(vessels, 'vessels.json')

    # 取得第一艘船的事件
    if vessels.get('entries'):
        vessel = vessels['entries'][0]
        vessel_id = vessel.get('id', '')

        print(f"\n=== 取得事件: {vessel.get('selfReportedInfo', [{}])[0].get('shipname', 'Unknown')} ===")
        events = get_vessel_events(vessel_id)
        print(f"找到 {len(events.get('entries', []))} 個事件")

        save_json(events, 'events.json')

    print("\n✅ 完成！")
