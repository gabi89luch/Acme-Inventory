// products-fallback.js - GENERATED from products.xml.
// Purpose: browsers block fetch() of local files when index.html is opened
// directly via file://. products.js uses this embedded copy only when the
// fetch fails; when the folder is served over HTTP it reads products.xml.
// Regenerate this file if products.xml changes:
//   python3 -c "x=open('products.xml').read(); open('products-fallback.js','w').write('window.PRODUCTS_XML_FALLBACK = `'+x+'`;\n')"
window.PRODUCTS_XML_FALLBACK = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Product inventory for the company. Exchange format: XML -->
<inventory company="Acme Manufacturing Co." lastUpdated="2026-10-12">
  <product code="101-23">
    <category>Electronics</category>
    <name>Wireless Mouse</name>
    <description>Ergonomic wireless mouse with 2.4GHz USB receiver and 12-month battery life.</description>
    <quantity>45</quantity>
    <unitPrice>19.99</unitPrice>
  </product>
  <product code="102-45">
    <category>Electronics</category>
    <name>Mechanical Keyboard</name>
    <description>Full-size mechanical keyboard with blue switches and RGB backlighting.</description>
    <quantity>30</quantity>
    <unitPrice>79.50</unitPrice>
  </product>
  <product code="103-11">
    <category>Electronics</category>
    <name>USB-C Hub</name>
    <description>7-in-1 USB-C hub with HDMI, SD card reader, and 100W power delivery.</description>
    <quantity>60</quantity>
    <unitPrice>34.95</unitPrice>
  </product>
  <product code="201-09">
    <category>Office Supplies</category>
    <name>A4 Printer Paper (500 sheets)</name>
    <description>Premium 80gsm white A4 printer paper, 500 sheets per ream.</description>
    <quantity>200</quantity>
    <unitPrice>6.50</unitPrice>
  </product>
  <product code="202-34">
    <category>Office Supplies</category>
    <name>Ballpoint Pen (Pack of 10)</name>
    <description>Smooth-writing blue ballpoint pens, pack of 10.</description>
    <quantity>150</quantity>
    <unitPrice>4.25</unitPrice>
  </product>
  <product code="203-77">
    <category>Office Supplies</category>
    <name>Stapler</name>
    <description>Heavy-duty desktop stapler with 25-sheet capacity.</description>
    <quantity>25</quantity>
    <unitPrice>12.00</unitPrice>
  </product>
  <product code="301-56">
    <category>Furniture</category>
    <name>Office Chair</name>
    <description>Ergonomic mesh office chair with lumbar support and adjustable height.</description>
    <quantity>12</quantity>
    <unitPrice>149.99</unitPrice>
  </product>
  <product code="302-88">
    <category>Furniture</category>
    <name>Standing Desk</name>
    <description>Electric height-adjustable standing desk, 140x70cm desktop.</description>
    <quantity>8</quantity>
    <unitPrice>299.00</unitPrice>
  </product>
  <product code="303-12">
    <category>Furniture</category>
    <name>Bookshelf</name>
    <description>5-tier wooden bookshelf, 180cm height, oak finish.</description>
    <quantity>15</quantity>
    <unitPrice>89.00</unitPrice>
  </product>
  <product code="401-20">
    <category>Networking</category>
    <name>Gigabit Switch (8-port)</name>
    <description>8-port gigabit Ethernet switch with auto-sensing ports.</description>
    <quantity>18</quantity>
    <unitPrice>24.99</unitPrice>
  </product>
  <product code="402-63">
    <category>Networking</category>
    <name>Wi-Fi Router</name>
    <description>Dual-band Wi-Fi 6 router with 4 Gigabit LAN ports.</description>
    <quantity>22</quantity>
    <unitPrice>89.95</unitPrice>
  </product>
  <product code="403-05">
    <category>Networking</category>
    <name>Ethernet Cable (5m)</name>
    <description>Cat6 UTP ethernet cable, 5 metres, blue.</description>
    <quantity>0</quantity>
    <unitPrice>3.50</unitPrice>
  </product>
</inventory>
`;
