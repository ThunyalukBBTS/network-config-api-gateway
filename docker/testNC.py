from ncclient import manager
import xmltodict
import json

# Connection Details
HOST = '127.0.0.1'
PORT = 830
USER = 'root'
PASS = 'frrpassword'

def get_interfaces_to_json():
    try:
        # 1. Establish NETCONF Session
        print(f"Connecting to {HOST}:{PORT}...")
        with manager.connect(host=HOST, 
                             port=PORT, 
                             username=USER, 
                             password=PASS, 
                             hostkey_verify=False) as m:
            
            print("Connected successfully.")

            # 2. Retrieve all data (Operational + Config)
            # We use m.get() to see active interfaces, not just saved config
            response = m.get()

            # 3. Parse XML to Dictionary
            # process_namespaces=False prevents the "Missing XML namespace" error
            data_dict = xmltodict.parse(response.data_xml, process_namespaces=False)

            # 4. Extract the 'data' content
            # Most NETCONF responses wrap content inside a 'data' key
            netconf_data = data_dict.get('data', {})

            # 5. Print as formatted JSON
            print("\n--- Interface/Device Data (JSON) ---")
            print(json.dumps(netconf_data, indent=4))

            # 6. Check if 'interfaces' key exists
            if 'interfaces' in netconf_data:
                print("\n[Success] Interface data found!")
            else:
                print("\n[Warning] No 'interfaces' tag found. The device might not have any interfaces configured in its YANG models.")

    except Exception as e:
        print(f"\n[Error] {e}")

if __name__ == "__main__":
    get_interfaces_to_json()