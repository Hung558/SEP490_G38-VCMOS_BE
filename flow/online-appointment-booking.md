# Main Business Flow: Online Appointment Booking (MF-01)

## 1. Overview

This swimlane (activity) diagram, labelled **MF-01**, models the end-to-end flow of a pet owner booking a clinic appointment and then being checked in at the clinic. The process spans three actors (swimlanes):

| Lane | Role in the process |
|------|--------------------|
| **Pet Owner** | Creates the booking and brings the pet to the clinic |
| **System** | Shows available slots, stores the order, notifies staff, and updates records at check-in |
| **Receptionist** | Handles the arrival of the pet, rescheduling if staff are busy, check-in, and cage assignment |

The process starts with the Pet Owner (initial node) and ends in the System lane (final node).

## 2. Actors and Their Activities

### 2.1 Pet Owner
- Select Pet & Services
- Select Date & Preferred Staff
- Pick Slot & Enter Symptom Note
- Click Submit Booking
- Bring Pet to Clinic

### 2.2 System
- Display Available Slots
- Save Order
- Notify Receptionist
- Update Order = Checked In
- Set Cage = Occupied

### 2.3 Receptionist
- Decision: Staff busy?
- Change time
- Click Check-in
- Assign Pet to Available Cage

## 3. Step-by-Step Flow

### Phase 1: Booking (Pet Owner and System)

1. **Start** – The flow begins at the initial node in the Pet Owner lane.
2. **Select Pet & Services** – The Pet Owner chooses which pet is being booked and the services required.
3. **Select Date & Preferred Staff** – The Pet Owner picks the appointment date and a preferred staff member.
4. **Display Available Slots** – The System shows the time slots that are available for the chosen date and staff.
5. **Pick Slot & Enter Symptom Note** – The Pet Owner chooses a slot and describes the pet's symptoms.
6. **Click Submit Booking** – The Pet Owner submits the booking.
7. **Save Order** – The System stores the booking as an order.
8. **Notify Receptionist** – The System alerts the Receptionist about the new booking.

### Phase 2: Arrival and Check-in (Pet Owner, Receptionist, System)

9. **Bring Pet to Clinic** – The Pet Owner brings the pet to the clinic. This step is triggered by the notification flow from the System.
10. **Decision: Staff busy?** – The Receptionist checks whether the assigned staff member is busy.
    - **[yes]** → **Change time**: The Receptionist changes the appointment time. The flow then loops back to **Bring Pet to Clinic**, so the Pet Owner arrives again at the new time.
    - **[no]** → **Click Check-in**: The Receptionist checks the pet in.
11. **Assign Pet to Available Cage** – The Receptionist assigns the pet to a free cage.
12. **Update Order = Checked In** – The System sets the order status to "Checked In".
13. **Set Cage = Occupied** – The System marks the assigned cage as occupied.
14. **End** – The flow terminates at the final node in the System lane.

## 4. Decision Point

| Decision | Condition | Outcome |
|----------|-----------|---------|
| **Staff busy?** (Receptionist) | **yes** | Receptionist changes the time; the Pet Owner brings the pet again (loop) |
| | **no** | Receptionist proceeds with check-in and cage assignment |

## 5. Flow Summary (Compact)

```
Start
  → Select Pet & Services
  → Select Date & Preferred Staff
  → [System] Display Available Slots
  → Pick Slot & Enter Symptom Note
  → Click Submit Booking
  → [System] Save Order
  → [System] Notify Receptionist
  → Bring Pet to Clinic
  → [Receptionist] Staff busy?
        ├─ yes → Change time → (back to Bring Pet to Clinic)
        └─ no  → Click Check-in
                  → Assign Pet to Available Cage
                  → [System] Update Order = Checked In
                  → [System] Set Cage = Occupied
                  → End
```

## 6. Data and State Changes

| Object | State change | Triggered by |
|--------|--------------|--------------|
| Order | Created and saved | Save Order |
| Order | Status → **Checked In** | Update Order = Checked In |
| Cage | Status → **Occupied** | Set Cage = Occupied |
| Appointment time | Modified | Change time (when staff are busy) |

## 7. Notes and Observations

- The diagram uses a single **decision node** and a single **loop** (Change time → Bring Pet to Clinic).
- The **Receptionist** lane is inactive until the Pet Owner arrives, even though the System notifies them earlier in the flow.
- Check-in is a **manual** step by the Receptionist, while the order status and cage status updates are **automated** by the System.
- The diagram does not show a rejection or cancellation path, for example when no slots are available or the cage is unavailable.

## 8. Required APIs

This section lists the APIs involved in the MF-01 business flow. The detailed specification of each API (method, endpoint, request, response, errors) is maintained separately in the `api/` directory. This file only points to those documents.

### 8.1 API Summary

| # | API | Caller | Supports diagram step | API doc |
|---|-----|--------|-----------------------|---------|
| 1 | List my pets | Pet Owner | Select Pet & Services | [list-pets.md](../api/pets/list-pets.md) |
| 2 | List services | Pet Owner | Select Pet & Services | [an-api-doc.md](../api/an-api-doc.md) |
| 3 | List staff | Pet Owner | Select Date & Preferred Staff | [an-api-doc.md](../api/an-api-doc.md) |
| 4 | Get available slots | Pet Owner | Display Available Slots | [an-api-doc.md](../api/an-api-doc.md) |
| 5 | Create booking (order) | Pet Owner | Pick Slot & Enter Symptom Note, Click Submit Booking, Save Order | [an-api-doc.md](../api/an-api-doc.md) |
| 6 | Notify receptionist | System | Notify Receptionist | [an-api-doc.md](../api/an-api-doc.md) |
| 7 | Get order details | Receptionist | Bring Pet to Clinic, Staff busy? | [an-api-doc.md](../api/an-api-doc.md) |
| 8 | Check staff status | Receptionist | Staff busy? | [an-api-doc.md](../api/an-api-doc.md) |
| 9 | Reschedule order | Receptionist | Change time | [an-api-doc.md](../api/an-api-doc.md) |
| 10 | Check in order | Receptionist | Click Check-in, Update Order = Checked In | [an-api-doc.md](../api/an-api-doc.md) |
| 11 | List available cages | Receptionist | Assign Pet to Available Cage | [an-api-doc.md](../api/an-api-doc.md) |
| 12 | Assign cage | Receptionist | Assign Pet to Available Cage, Set Cage = Occupied | [an-api-doc.md](../api/an-api-doc.md) |

### 8.2 API Calls Mapped to the Flow

| Diagram step | Lane | API(s) used |
|--------------|------|-------------|
| Select Pet & Services | Pet Owner | #1 List my pets, #2 List services |
| Select Date & Preferred Staff | Pet Owner | #3 List staff |
| Display Available Slots | System | #4 Get available slots |
| Pick Slot & Enter Symptom Note | Pet Owner | (UI input, sent with #5) |
| Click Submit Booking | Pet Owner | #5 Create booking |
| Save Order | System | #5 Create booking (server side) |
| Notify Receptionist | System | #6 Notify receptionist |
| Bring Pet to Clinic | Pet Owner | (physical action; the Receptionist opens #7 Get order details) |
| Staff busy? | Receptionist | #8 Check staff status |
| Change time | Receptionist | #9 Reschedule order |
| Click Check-in | Receptionist | #10 Check in order |
| Assign Pet to Available Cage | Receptionist | #11 List available cages, #12 Assign cage |
| Update Order = Checked In | System | #10 Check in order (server side) |
| Set Cage = Occupied | System | #12 Assign cage (server side) |