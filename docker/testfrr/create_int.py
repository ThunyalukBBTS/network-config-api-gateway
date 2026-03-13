from ncclient import manager

HOST = '127.0.0.1'
PORT = 830
USER = 'root'
PASS = 'frrpassword'

config_xml = """
<config xmlns="urn:ietf:params:xml:ns:netconf:base:1.0">
  <interfaces xmlns="urn:ietf:params:xml:ns:yang:ietf-interfaces">
    <interface>
      <name>lo100</name>
      <type xmlns:ianaift="urn:ietf:params:xml:ns:yang:iana-if-type">ianaift:softwareLoopback</type>
      <enabled>true</enabled>
      <description>Created by Atom via Python</description>
      <ipv4 xmlns="urn:ietf:params:xml:ns:yang:ietf-ip">
        <address>
          <ip>10.100.100.1</ip>
          <prefix-length>24</prefix-length>
        </address>
      </ipv4>
    </interface>
  </interfaces>
</config>
"""

def create_lo():
    try:
        with manager.connect(host=HOST, port=PORT, username=USER, 
                             password=PASS, hostkey_verify=False) as m:
            
            print("Sending edit-config to create lo100...")
            response = m.edit_config(target='running', config=config_xml)
            print("Server Response:", response)
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    create_lo()