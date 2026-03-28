from ncclient import manager
import xmltodict
import json

HOST = '127.0.0.1'
PORT = 830
USER = 'root'
PASS = 'frrpassword'

def get_interfaces_only():
    try:
        print(f"Connecting to {HOST}:{PORT}...")
        with manager.connect(host=HOST, 
                             port=PORT, 
                             username=USER, 
                             password=PASS, 
                             hostkey_verify=False) as m:
            
            # 1. ดึงข้อมูลทั้งหมดเลย (วิธีนี้ทำงานผ่าน 100% จากการเทสรอบก่อน)
            response = m.get()

            # 2. แปลง XML เป็น Dictionary ทันที (ข้ามการเช็ค namespace)
            data_dict = xmltodict.parse(response.data_xml, process_namespaces=False)
            
            # 3. เข้าถึงก้อนข้อมูล <data>
            all_data = data_dict.get('data', {})
            
            # 4. ใช้ Python วนหา Key ที่เกี่ยวกับ Interface
            interfaces_data = None
            for key, value in all_data.items():
                if 'interfaces' in key.lower():
                    interfaces_data = value
                    break

            # 5. ปริ้นผลลัพธ์แบบสั้นๆ และสวยงาม
            if interfaces_data:
                print("\n" + "="*40)
                print("       MY NETWORK INTERFACES")
                print("="*40)
                print(json.dumps(interfaces_data, indent=4))
                print("="*40)
                print("[Success] Data retrieved successfully.")
            else:
                print("\n[Warning] No interfaces found in the data.")

    except Exception as e:
        print(f"\n[Error] {e}")

if __name__ == "__main__":
    get_interfaces_only()