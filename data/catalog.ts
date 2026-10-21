import type { Certification } from "./types";

/**
 * Metadata-only catalog entries.
 *
 * Every exam CertPath lists appears here so the catalog, planner and
 * readiness tracker can reference an exam before (or even if) it ships with a
 * full question bank. Exams that *do* ship with original question banks and
 * flashcards live in `data/certs/*.ts` and are merged in `data/index.ts`.
 */
export const CATALOG: Certification[] = [
  /* ── Microsoft ─────────────────────────────────────────────────────── */
  {
    id: "az-104",
    vendor: "microsoft",
    examCode: "AZ-104",
    name: "Azure Administrator Associate",
    description:
      "Proves you can manage Azure identities, storage, compute, networking and monitoring in a production environment.",
    level: "Associate",
    durationMin: 120,
    questionCount: 50,
    passingScore: 700,
    scoreScale: "scaled",
    officialExamUrl:
      "https://learn.microsoft.com/en-us/credentials/certifications/azure-administrator-az-104",
    domains: [
      { id: "identities", name: "Azure Identities and Governance", weight: 20 },
      { id: "storage", name: "Implement and Manage Storage", weight: 20 },
      { id: "compute", name: "Deploy and Manage Compute", weight: 25 },
      { id: "network", name: "Implement and Manage Virtual Networking", weight: 15 },
      { id: "monitor", name: "Monitor and Maintain Resources", weight: 20 },
    ],
    nextSteps: ["az-305"],
  },
  {
    id: "az-305",
    vendor: "microsoft",
    examCode: "AZ-305",
    name: "Azure Solutions Architect Expert",
    description:
      "Expert-level architecture exam covering resilient, secure and cost-optimised Azure design decisions.",
    level: "Expert",
    durationMin: 120,
    questionCount: 45,
    passingScore: 700,
    scoreScale: "scaled",
    officialExamUrl:
      "https://learn.microsoft.com/en-us/credentials/certifications/azure-solutions-architect-expert-az-305",
    domains: [
      { id: "design", name: "Design Azure Solutions", weight: 30 },
      { id: "infrastructure", name: "Design Infrastructure Solutions", weight: 35 },
      { id: "data", name: "Design Data Solutions", weight: 15 },
      { id: "security", name: "Design Security and Identity", weight: 20 },
    ],
    nextSteps: [],
  },
  {
    id: "sc-900",
    vendor: "microsoft",
    examCode: "SC-900",
    name: "Security, Compliance and Identity Fundamentals",
    description:
      "Entry-level exam on security, compliance and identity principles shared across Microsoft Cloud.",
    level: "Beginner",
    durationMin: 45,
    questionCount: 40,
    passingScore: 700,
    scoreScale: "scaled",
    officialExamUrl:
      "https://learn.microsoft.com/en-us/credentials/certifications/security-compliance-identity-fundamentals-sc-900",
    domains: [
      { id: "security", name: "Security Concepts and Methods", weight: 35 },
      { id: "identity", name: "Identity and Access Management", weight: 25 },
      { id: "defense", name: "Defence in the Cloud", weight: 20 },
      { id: "governance", name: "Governance and Compliance", weight: 20 },
    ],
    nextSteps: ["az-104", "security-plus"],
  },

  /* ── AWS ───────────────────────────────────────────────────────────── */
  {
    id: "aws-saa-c02",
    vendor: "aws",
    examCode: "AWS-SAA-C02",
    name: "Solutions Architect Associate",
    description:
      "Designs distributed, resilient and cost-optimised systems on AWS, with a heavy emphasis on trade-offs.",
    level: "Associate",
    durationMin: 130,
    questionCount: 65,
    passingScore: 72,
    scoreScale: "percent",
    officialExamUrl: "https://aws.amazon.com/certification/certified-solutions-architect-associate/",
    domains: [
      { id: "secure", name: "Design Secure Architectures", weight: 30 },
      { id: "resilient", name: "Design Resilient Architectures", weight: 26 },
      { id: "performant", name: "Design High-Performing Architectures", weight: 24 },
      { id: "cost", name: "Design Cost-Optimised Architectures", weight: 20 },
    ],
    nextSteps: [],
  },
  {
    id: "aws-soa-c02",
    vendor: "aws",
    examCode: "AWS-SOA-C02",
    name: "SysOps Associate",
    description:
      "Operates and troubleshoots AWS workloads, covering deployment, monitoring, cost and incident response.",
    level: "Associate",
    durationMin: 130,
    questionCount: 60,
    passingScore: 72,
    scoreScale: "percent",
    officialExamUrl: "https://aws.amazon.com/certification/certified-sysops-associate-cloud/",
    domains: [
      { id: "operations", name: "Operations and Monitoring", weight: 25 },
      { id: "deployment", name: "Deployment and Automation", weight: 30 },
      { id: "resilience", name: "Resilience and Recovery", weight: 20 },
      { id: "security", name: "Security and Cost", weight: 25 },
    ],
    nextSteps: ["aws-saa-c02"],
  },
  {
    id: "aws-dva-c02",
    vendor:awsId(),
    examCode: "AWS-DVA-C02",
    name: "Developer Associate",
    description:
      "Builds, deploys and debugs cloud-native applications using AWS SDKs, serverless services and CI/CD.",
    level: "Associate",
    durationMin: 130,
    questionCount: 65,
    passingScore: 72,
    scoreScale: "percent",
    officialExamUrl: "https://aws.amazon.com/certification/certified-developer-associate/",
    domains: [
      { id: "devops", name: "Continuous Delivery", weight: 25 },
      { id: "application", name: "Application Development", weight: 25 },
      { id: "databases", name: "Databases", weight: 20 },
      { id: "security", name: "Security and Solutions Architecture", weight: 30 },
    ],
    nextSteps: ["aws-saa-c02"],
  },

  /* ── CompTIA ───────────────────────────────────────────────────────── */
  {
    id: "network-plus",
    vendor: "comptia",
    examCode: "N10-009",
    name: "Network+",
    description:
      "Networking fundamentals, operations and troubleshooting across wired, wireless and virtual environments.",
    level: "Associate",
    durationMin: 90,
    questionCount: 35,
    passingScore: 750,
    scoreScale: "scaled",
    officialExamUrl: "https://www.comptia.org/certifications/network",
    domains: [
      { id: "fundamentals", name: "Networking Fundamentals", weight: 20 },
      { id: "infrastructure", name: "Network Infrastructure", weight: 18 },
      { id: "operations", name: "Network Operations", weight: 28 },
      { id: "security", name: "Network Security", weight: 22 },
      { id: "troubleshooting", name: "Network Troubleshooting", weight: 12 },
    ],
    nextSteps: ["security-plus", "ccna"],
  },
  {
    id: "a-plus",
    vendor: "comptia",
    examCode: "220-1201 / 220-1202",
    name: "A+",
    description:
      "Entry-level IT technician exam covering hardware, mobile devices, operating systems and troubleshooting.",
    level: "Beginner",
    durationMin: 90,
    questionCount: 90,
    passingScore: 750,
    scoreScale: "scaled",
    officialExamUrl: "https://www.comptia.org/certifications/a",
    domains: [
      { id: "hardware", name: "Hardware and Software", weight: 30 },
      { id: "mobile", name: "Mobile Devices", weight: 14 },
      { id: "os", name: "Operating Systems", weight: 22 },
      { id: "security", name: "Security", weight: 12 },
      { id: "troubleshooting", name: "Operational Procedures and Troubleshooting", weight: 22 },
    ],
    nextSteps: ["network-plus", "security-plus"],
  },

  /* ── Cisco ─────────────────────────────────────────────────────────── */
  {
    id: "ccnp-enarsi",
    vendor: "cisco",
    examCode: "350-401",
    name: "CCNP Enterprise ENARSI",
    description:
      "Advanced routing and switching, including routing protocols, automation and campus design.",
    level: "Professional",
    durationMin: 120,
    questionCount: 50,
    passingScore: 825,
    scoreScale: "scaled",
    officialExamUrl: "https://www.ciscopartners.com/CCNP-ENARSI",
    domains: [
      { id: "architecture", name: "Network Architecture", weight: 20 },
      { id: "routing", name: "Routing", weight: 25 },
      { id: "switching", name: "Switching", weight: 25 },
      { id: "automation", name: "Automation and Assurance", weight: 30 },
    ],
    nextSteps: [],
  },

  /* ── Google Cloud ──────────────────────────────────────────────────── */
  {
    id: "gcp-ace",
    vendor: "google",
    examCode: "GCP-ACE",
    name: "Associate Cloud Engineer",
    description:
      "Deploys and manages Google Cloud projects, networks, storage and compute with an emphasis on troubleshooting.",
    level: "Associate",
    durationMin: 150,
    questionCount: 50,
    passingScore: 800,
    scoreScale: "scaled",
    officialExamUrl: "https://www.google.com/certification/exam_associate_cloud_engineer",
    domains: [
      { id: "design", name: "Application and Service Design", weight: 20 },
      { id: "deploy", name: "Deploy and Implement", weight: 30 },
      { id: "operate", name: "Operate and Troubleshoot", weight: 30 },
      { id: "optimize", name: "Optimize Resources", weight: 20 },
    ],
    nextSteps: [],
  },

  /* ── ISC2 ──────────────────────────────────────────────────────────── */
  {
    id: "cissp",
    vendor: "isc2",
    examCode: "CISSP",
    name: "Certified Information Systems Security Professional",
    description:
      "Eight-domain security leadership exam covering governance, risk, architecture and security operations.",
    level: "Professional",
    durationMin: 180,
    questionCount: 150,
    passingScore: 800,
    scoreScale: "scaled",
    officialExamUrl: "https://www.isc2.org/certifications/cissp",
    domains: [
      { id: "domain1", name: "Security Practice", weight: 12 },
      { id: "domain2", name: "Security Concepts and Practices", weight: 12 },
      { id: "domain3", name: "Security Architecture", weight: 13 },
      { id: "domain4", name: "Security Operations", weight: 13 },
      { id: "domain5", name: "Security Program Management", weight: 12 },
      { id: "domain6", name: "Law, Ethics and Compliance", weight: 13 },
      { id: "domain7", name: "Software Development Security", weight: 12 },
      { id: "domain8", name: "Security Risks and Governance", weight: 13 },
    ],
    nextSteps: [],
  },
  {
    id: "ccsp",
    vendor: "isc2",
    examCode: "CCSP",
    name: "Certified Cloud Security Professional",
    description:
      "Cloud security architecture and operations exam spanning data, infrastructure and security operations.",
    level: "Professional",
    durationMin: 180,
    questionCount: 150,
    passingScore: 800,
    scoreScale: "scaled",
    officialExamUrl: "https://www.isc2.org/certifications/ccsp",
    domains: [
      { id: "cloud", name: "Cloud Concepts", weight: 18 },
      { id: "data", name: "Data Security", weight: 20 },
      { id: "platform", name: "Security for Cloud Platforms", weight: 20 },
      { id: "design", name: "Cloud Security Architecture", weight: 22 },
      { id: "ops", name: "Security Operations", weight: 20 },
    ],
    nextSteps: ["cissp"],
  },

  /* ── PMI ───────────────────────────────────────────────────────────── */
  {
    id: "pmp",
    vendor: "pmi",
    examCode: "PMP",
    name: "Project Management Professional",
    description:
      "Predictive, agile and hybrid project delivery exam with people, process and business environment domains.",
    level: "Professional",
    durationMin: 230,
    questionCount: 180,
    passingScore: 750,
    scoreScale: "scaled",
    officialExamUrl: "https://www.pmi.org/certifications/project-management-professional",
    domains: [
      { id: "people", name: "People", weight: 42 },
      { id: "process", name: "Process", weight: 50 },
      { id: "environment", name: "Business Environment", weight: 8 },
    ],
    nextSteps: [],
  },
  {
    id: "capm",
    vendor: "pmi",
    examCode: "CAPM",
    name: "Certified Associate in Project Management",
    description:
      "Entry-level project management exam covering project management fundamentals and process.",
    level: "Beginner",
    durationMin: 150,
    questionCount: 150,
    passingScore: 610,
    scoreScale: "scaled",
    officialExamUrl: "https://www.pmi.org/certifications/certified-associate-project-management-capm",
    domains: [
      { id: "principles", name: "Project Management Principles and Concepts", weight: 50 },
      { id: "process", name: "Project Management Process", weight: 50 },
    ],
    nextSteps: ["pmp"],
  },

  /* ── Linux Foundation ──────────────────────────────────────────────── */
  {
    id: "lfcs",
    vendor: "linux",
    examCode: "LFCS",
    name: "Linux Foundation Certified System Administrator",
    description:
      "Hands-on Linux administration covering filesystems, networking, storage, security and troubleshooting.",
    level: "Associate",
    durationMin: 120,
    questionCount: 60,
    passingScore: 500,
    scoreScale: "scaled",
    officialExamUrl:
      "https://training.linuxfoundation.org/certification/linux-foundation-certified-system-administrator-lfcs/",
    domains: [
      { id: "system", name: "System and Hardware", weight: 12 },
      { id: "filesystems", name: "Filesystems and Storage", weight: 22 },
      { id: "networking", name: "Networking", weight: 18 },
      { id: "security", name: "Security", weight: 14 },
      { id: "scripting", name: "Scripting and Automation", weight: 16 },
      { id: "troubleshooting", name: "Troubleshooting", weight: 18 },
    ],
    nextSteps: ["cka"],
  },
  {
    id: "cka",
    vendor: "linux",
    examCode: "CKA",
    name: "Certified Kubernetes Administrator",
    description:
      "Hands-on Kubernetes administration: cluster architecture, workloads, networking, storage and troubleshooting.",
    level: "Professional",
    durationMin: 120,
    questionCount: 17,
    passingScore: 66,
    scoreScale: "percent",
    officialExamUrl: "https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/",
    domains: [
      { id: "architecture", name: "Cluster Architecture", weight: 25 },
      { id: "workloads", name: "Workloads and Scheduling", weight: 15 },
      { id: "services", name: "Services and Networking", weight: 20 },
      { id: "storage", name: "Storage", weight: 20 },
      { id: "troubleshooting", name: "Troubleshooting", weight: 20 },
    ],
    nextSteps: [],
  },

  /* ── VMware ────────────────────────────────────────────────────────── */
  {
    id: "vcp-vcsa",
    vendor: "vmware",
    examCode: "VCP-VCSA",
    name: "vSphere Certified Administrator",
    description:
      "VMware vSphere installation, configuration, storage, networking, availability and troubleshooting.",
    level: "Associate",
    durationMin: 90,
    questionCount: 50,
    passingScore: 70,
    scoreScale: "percent",
    officialExamUrl: "https://www.vmware.com/en/education/certification/vsphere-certified-administrator",
    domains: [
      { id: "install", name: "vSphere Deployment", weight: 20 },
      { id: "storage", name: "Storage Management", weight: 20 },
      { id: "availability", name: "Availability and Scalability", weight: 20 },
      { id: "troubleshooting", name: "Troubleshooting", weight: 20 },
      { id: "vmware", name: "VMware Workspace ONE", weight: 20 },
    ],
    nextSteps: [],
  },
];

/** Small helper so the table above stays readable. */
function awsId(): string {
  return "aws";
}
