# SaaS System Architecture

## High Level Components

Frontend
API Layer
Agent Orchestrator
Marketplace Connectors
Supplier Connectors
Database
Analytics Engine

## Agent Flow

1 Discover Products
2 Filter Products
3 Analyze Market Demand
4 Generate Listing Content
5 Optimize Images
6 Set Pricing
7 Publish Listings
8 Monitor Metrics
9 Optimize Listings
10 Detect Winners
11 Scale Winners

## Data Storage

Tables required:

products
supplier_products
marketplace_listings
listing_metrics
winning_products

## Scheduler

Recurring jobs:

product discovery: every 12h
stock sync: every 6h
listing optimization: every 48h
winner detection: every 24h

## Marketplace APIs

Mercado Libre API
eBay Developer API
Amazon SP API

## AliExpress Data

AliExpress Dropshipping API

## Failure Handling

If API fails:
retry 3 times
log error
alert system