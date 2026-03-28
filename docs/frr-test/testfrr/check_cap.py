from ncclient import manager

HOST = '127.0.0.1'
PORT = 830
USER = 'root'
PASS = 'frrpassword'

def check_capabilities():
    try:
        with manager.connect(host=HOST, port=PORT, username=USER, 
                             password=PASS, hostkey_verify=False) as m:
            
            print("--- Supported Interface Models ---")
            found = False
            for cap in m.server_capabilities:
                if 'interface' in cap.lower() or 'iana' in cap.lower() or 'frr' in cap.lower():
                    print(cap)
                    found = True
                    
            if not found:
                print("No interface or IANA models found!")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_capabilities()