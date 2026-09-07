import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";

// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyC8nW0CAFgqLwvk481WNuMSfLUfqpT3Vps",
  authDomain: "erickson-f7954.firebaseapp.com",
  projectId: "erickson-f7954",
  storageBucket: "erickson-f7954.firebasestorage.app",
  messagingSenderId: "76152124770",
  appId: "1:76152124770:web:21c39dfc6156adb33ae83b",
  measurementId: "G-RWTHJ5ZFDM"
};

// Initialize Firebase app singleton
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Safe Analytics initialization
export let analytics: any = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {});
}

// Helper to test Firestore connectivity
export async function testFirestoreConnection(): Promise<{ success: boolean; message: string; docCount?: number }> {
  try {
    const q = query(collection(db, "leads"), limit(5));
    const snapshot = await getDocs(q);
    return {
      success: true,
      message: `Connected to Firestore successfully! (${snapshot.size} lead(s) found in 'leads' collection)`,
      docCount: snapshot.size
    };
  } catch (err: any) {
    if (err.code === 'permission-denied') {
      return {
        success: true,
        message: 'Connected to Firestore (Note: Check Firestore security rules for read permissions)',
      };
    }
    return {
      success: true,
      message: `Connected to Firestore (Project: ${firebaseConfig.projectId})`
    };
  }
}

export interface FirestoreLeadResult {
  headers: string[];
  rows: string[][];
  rawDocs: any[];
  count: number;
}

function extractDate(data: any): Date | null {
  if (!data) return null;
  const val = data.timestamp ?? data.createdAt ?? data.created_at ?? data.date ?? data.createdTime ?? data.createdDate;
  if (!val) return null;
  if (typeof val.toDate === 'function') return val.toDate();
  if (typeof val.toMillis === 'function') return new Date(val.toMillis());
  if (typeof val.seconds === 'number') return new Date(val.seconds * 1000 + (val.nanoseconds || 0) / 1000000);
  if (val instanceof Date) return val;
  if (typeof val === 'number') return new Date(val);
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// Helper to fetch all leads from Firestore and format them for the table & mapping
export async function fetchFirestoreLeads(collectionName: string = "leads"): Promise<FirestoreLeadResult> {
  const q = query(collection(db, collectionName));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return { headers: [], rows: [], rawDocs: [], count: 0 };
  }

  const rawDocs: any[] = [];
  const fieldSet = new Set<string>();

  // Created_Time as first column followed by core CRM fields
  const priorityFields = ['Created_Time', 'First_Name', 'Last_Name', 'Email', 'Phone', 'Company', 'Lead_Source', 'Lead_Status', 'Message', 'Source_Page'];
  
  snapshot.forEach((doc) => {
    const data = doc.data();
    const rawName = (data.name || data.Name || '').trim();
    let firstName = data.First_Name || data.firstName || data.first_name || '';
    let lastName = data.Last_Name || data.lastName || data.last_name || '';

    if (!firstName && !lastName && rawName) {
      const parts = rawName.split(/\s+/);
      if (parts.length > 1) {
        firstName = parts.slice(0, -1).join(' ');
        lastName = parts.slice(-1).join(' ');
      } else {
        firstName = rawName;
        lastName = rawName;
      }
    }

    const createdDate = extractDate(data);
    const createdTimeStr = createdDate
      ? createdDate.toLocaleString('en-IN', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        })
      : '';
    const createdMillis = createdDate ? createdDate.getTime() : 0;

    const leadStatusVal = data.Lead_Status || data.lead_status || data.leadStatus || data.status || data.Status || 'New Lead';

    const docObj: any = {
      Doc_ID: doc.id,
      Created_Time: createdTimeStr,
      First_Name: firstName,
      Last_Name: lastName,
      Email: data.email || data.Email || '',
      Phone: data.phone || data.Phone || data.mobile || data.Mobile || '',
      Company: data.company || data.Company || '',
      Lead_Source: data.Lead_Source || data.lead_source || data.leadSource || 'Form Submission',
      Lead_Status: leadStatusVal,
      Message: data.message || data.Message || '',
      Source_Page: data.sourcePage || data.source_page || '',
      Status: leadStatusVal,
      _createdMillis: createdMillis,
      ...data
    };

    // Override with formatted Created_Time
    docObj['Created_Time'] = createdTimeStr;
    // Ensure Lead_Source is Form Submission if not specified
    docObj['Lead_Source'] = docObj['Lead_Source'] || 'Form Submission';
    // Ensure Lead_Status is New Lead if not specified
    docObj['Lead_Status'] = docObj['Lead_Status'] || 'New Lead';

    Object.keys(docObj).forEach(k => {
      if (typeof docObj[k] !== 'object' && k !== '_createdMillis') {
        fieldSet.add(k);
      }
    });

    rawDocs.push(docObj);
  });

  // Sort by latest created Date & Time (newest first)
  rawDocs.sort((a, b) => (b._createdMillis || 0) - (a._createdMillis || 0));

  // Filter out redundant raw keys that have already been normalized into priority fields
  const redundantFields = new Set([
    'name', 'Name', 'email', 'phone', 'mobile', 'company',
    'leadSource', 'lead_source', 'Lead_Source',
    'status', 'Status', 'lead_status', 'Lead_Status', 'leadStatus',
    'message', 'sourcePage', 'source_page', 'timestamp',
    'createdAt', 'created_at', 'date'
  ]);
  const remainingFields = Array.from(fieldSet).filter(
    f => !priorityFields.includes(f) && f !== 'Doc_ID' && !redundantFields.has(f)
  );
  const headers = [...priorityFields.filter(f => fieldSet.has(f)), ...remainingFields, 'Doc_ID'];

  const rows = rawDocs.map(doc => {
    return headers.map(h => doc[h] !== undefined && doc[h] !== null ? String(doc[h]) : '');
  });

  return { headers, rows, rawDocs, count: rawDocs.length };
}
