## P53 - Canonical Admin Information Architecture

### Near-final admin console model after this sprint

#### 1. Canonical operations truth layer

Shown first on primary admin surfaces:

- what listings are live
- what listings are blocked
- exact blocker code and message
- next operator action
- evidence timestamps
- agent decision trace
- post-sale proof ladder

#### 2. Technical readiness layer

Shown second:

- database
- redis
- workers
- connector/auth health
- runtime automation health

Rule:

- technical readiness does not override listing or commercial truth

#### 3. Control/action layer

Shown third:

- real automation buttons
- scheduler state
- validation-cycle actions

Rule:

- actions are execution controls, not proof of business success

### Admin experience objective

The operator should immediately understand:

- what is live
- what is blocked
- what requires manual action
- what proof stage has been reached
- what the last agent decided
- what to do next
