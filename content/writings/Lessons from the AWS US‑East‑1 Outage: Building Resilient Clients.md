---
title: Lessons from the AWS US‑East‑1 Outage: Building Resilient Clients
date: 2025-11-08
excerpt: A deep dive into the October 2025 AWS us‑east‑1 outage, its root cause, cascading impacts, and best practices for building resilient cloud clients.
---

# Lessons from the AWS US‑East‑1 Outage: Building Resilient Clients
Background

PLEASE NOTE: This writing was generated fully by ChatGPT 5, via the router mechanism. One of the biggest
goals for this website is to have a voicing font design, where instantly at a glance you can determine
which characters on the site were: written entirely by myself a human, generated entirely by an AI, were
written via a cooperative AI and human interaction. I've been working on this but it's more difficult
to do than I anticipated.

In mid‑October 2025 the AWS us‑east‑1 region experienced a significant multi‑hour disruption. Many AWS services – including Amazon DynamoDB, EC2, and Network Load Balancer – saw elevated error rates and latencies. High‑profile customers such as Slack, Snapchat, Venmo and even parts of Amazon’s own retail site reported outages or degraded performance.

The root cause, according to AWS’s post‑event summary, was a latent race condition in DynamoDB’s DNS management system. Under normal circumstances, a “DNS planner” component assembles DNS records for each service endpoint and multiple “DNS enactors” apply those plans in Route 53. During the incident one enactor lagged behind while another applied a newer plan and then cleaned up older plans. Due to a race condition, the older enactor overwrote the newer plan and the cleanup process then deleted the plan entirely, leaving the regional endpoint without any IP addresses and blocking subsequent updates. This broke name resolution for DynamoDB’s regional endpoint (dynamodb.us-east-1.amazonaws.com) and caused widespread request failures.

AWS engineers identified and mitigated the root cause within roughly two hours of the first elevated error rates (which started around 11:49 p.m. PT on 19 October). However, the wider recovery stretched into the next afternoon because dependent systems (EC2 droplet lease management, network propagation, NLB health checks and other services) had accumulated backlogs or entered congestive collapse while DynamoDB was unavailable. Engineers had to throttle work, restart control‑plane processes and clear queues before new instances could be launched and load balancers could recover.

The incident illustrates two important points:

Speed of root‑cause mitigation vs. recovery: AWS fixed the race condition quickly, but the total impact lasted about 15 hours because downstream systems were not designed to gracefully handle the upstream failure.

The role of client behaviour: Many customer applications amplified the outage by retrying aggressively, lacking failover, or depending on a single region. Conversely, applications that used DynamoDB Global Tables, multi‑region EC2 deployments, or properly tuned retry logic continued to operate or failed gracefully.

Why client design matters

Running on a cloud platform does not automatically confer resilience. In fact, the way your client interacts with a service – how it retries, caches DNS, and handles failures – can be the difference between a blip and a cascade. During this outage, AWS noted that bad client behaviour contributed to the overall impact:

Retry storms: Many clients retried failed requests immediately and synchronously without limits. When the regional endpoint stopped resolving, thousands of clients hammered the control plane simultaneously, exacerbating congestion and delaying recovery. In contrast, clients using jittered exponential backoff spread their retries over time and reduced load.

Single‑region dependencies: Applications that ran solely in us‑east‑1 with no cross‑region replication or failover experienced complete downtime. Those using Route 53 health‑check failover or DynamoDB Global Tables could route traffic to another region and remained available.

Lack of idempotency: Some workflows replayed the same mutation multiple times during retries, creating duplicate work or inconsistent state. Mutating API calls should include idempotency tokens so they can be safely retried.

Synchronous chains: Tight coupling between services meant that if one call stalled (e.g. creating an EC2 instance), it blocked dependent processes, causing backlogs. Decoupling with queues and circuit breakers can isolate failures and allow partial progress.

Best practices for resilient clients

To minimize the blast radius of infrastructure outages and to help AWS recover faster, architects and developers should adopt the following practices:

Use jittered exponential backoff and sensible limits for retries. Standard AWS SDKs support a “standard” retry mode
 with randomised delays and circuit breaking. Configure per‑call timeouts and do not retry indefinitely.

Make mutations idempotent. Include idempotency tokens on create/update operations so that retries do not produce duplicate side effects.

Architect for multiple availability zones and regions. Deploy EC2 instances across at least two AZs and, when appropriate, across regions. Use Route 53 health‑check failover to shift traffic if a regional endpoint becomes unhealthy. For stateful data, consider DynamoDB Global Tables (now supporting multi‑region strong consistency) or other replication strategies.

Decouple synchronous workflows. Introduce queues (e.g. Amazon SQS, SNS, or EventBridge) between producer and consumer components. This absorbs spikes, allows retries without blocking threads, and makes downstream failures less likely to cascade.

Manage DNS caching thoughtfully. Respect TTLs and avoid caching stale or empty records for too long. Implement a mechanism to flush caches or fall back to alternative endpoints if DNS resolution fails.

Implement circuit breakers and graceful degradation. Detect when a downstream service is failing and stop sending traffic temporarily, falling back to degraded functionality rather than continuing to retry at full speed.

Test failover and simulate outages. Regularly exercise your multi‑AZ and multi‑region architecture under failure scenarios to ensure your automation works when you need it.

Key takeaways

Cloud resilience is shared responsibility. AWS provides highly available services, but clients must use them correctly. Outages will happen; design for them.

Quick fixes do not equal quick recovery. Addressing a root cause may be fast, but clearing backlogs and restarting control‑plane processes can take hours if systems and clients are not prepared.

Well‑behaved clients help everyone. Using jittered retries, idempotency, and multi‑region architectures not only protect your own application but also reduce stress on AWS during incidents, accelerating recovery for all.

By learning from the us‑east‑1 outage and implementing these practices, engineers can build systems that are more tolerant of failures and deliver a better experience for their users—even when the cloud is under strain.
