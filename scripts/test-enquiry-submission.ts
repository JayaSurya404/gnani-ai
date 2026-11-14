async function test() {
  const res = await fetch("http://localhost:3000/api/enquiry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Karthik Subramanian",
      phone: "+916382868845",
      email: "karthik.solar@gmail.com",
      primaryInterest: "5kW Residential Rooftop Solar",
      monthlyBill: "6500",
      systemSize: "5 kW",
      utmSource: "Public Page (aadhira-solar)",
      dwellTimeSeconds: 42,
      hasInteractedWithCalculator: true,
    }),
  });

  const data = await res.json();
  console.log("Enquiry submission response:", data);
}

test().catch(console.error);

