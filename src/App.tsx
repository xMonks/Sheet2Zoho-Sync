import { useState, useEffect } from 'react';
import { 
  Database, 
  FileSpreadsheet, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  ChevronRight,
  Settings,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Login from './components/Login';

interface Sheet {
  id: string;
  name: string;
}

interface Status {
  googleConnected: boolean;
  zohoConnected: boolean;
  config?: {
    google: boolean;
    zoho: boolean;
    appUrl: boolean;
  };
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [status, setStatus] = useState<Status>({ 
    googleConnected: false, 
    zohoConnected: false,
    config: { google: false, zoho: false, appUrl: false }
  });
  const [googleTokens, setGoogleTokens] = useState<any>(null);
  const [zohoTokens, setZohoTokens] = useState<any>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [sheetData, setSheetData] = useState<any[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({
    'First_Name': '',
    'Last_Name': '',
    'Email': '',
    'Company': '',
    'Position': '',
    'Mobile': '',
  });
  const [fixedValues, setFixedValues] = useState<Record<string, string>>({
    'Lead_Status': '',
    'Owner': '',
    'Lead_Source': ''
  });
  const [zohoMetadata, setZohoMetadata] = useState<{leadStatus: any[], leadSource: any[], users: any[]} | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [testLeads, setTestLeads] = useState<any[] | null>(null);
  const [testingZoho, setTestingZoho] = useState(false);
  const [activeTab, setActiveTab] = useState<'mapping' | 'select' | 'leads' | 'manual'>('mapping');
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [duplicateCheckField, setDuplicateCheckField] = useState('Email');
  
  const [manualLead, setManualLead] = useState<Record<string, string>>({
    'First_Name': '',
    'Last_Name': '',
    'Email': '',
    'Company': '',
    'Position': '',
    'Mobile': '',
  });
  const [manualFixedValues, setManualFixedValues] = useState<Record<string, string>>({
    'Lead_Status': 'New Lead',
    'Owner': 'Rejna Balan',
    'Lead_Source': 'Whatsapp Marketing'
  });
  const [manualSyncing, setManualSyncing] = useState(false);

  useEffect(() => {
    // Check authentication
    const auth = localStorage.getItem('isAuthenticated');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }

    // Load tokens from localStorage on mount
    const storedGoogle = localStorage.getItem('googleTokens');
    if (storedGoogle) {
      setGoogleTokens(JSON.parse(storedGoogle));
      setStatus(s => ({ ...s, googleConnected: true }));
      fetchSheets();
    }
    const storedZoho = localStorage.getItem('zohoTokens');
    if (storedZoho) {
      setZohoTokens(JSON.parse(storedZoho));
      setStatus(s => ({ ...s, zohoConnected: true }));
    }

    fetchStatus();

    const handleAuthSuccess = (type: string, payload?: any) => {
      if (type === 'GOOGLE_AUTH_SUCCESS') {
        if (payload) {
          setGoogleTokens(payload);
          localStorage.setItem('googleTokens', JSON.stringify(payload));
        }
        setStatus(s => ({ ...s, googleConnected: true }));
        fetchSheets();
      } else if (type === 'ZOHO_AUTH_SUCCESS') {
        if (payload) {
          setZohoTokens(payload);
          localStorage.setItem('zohoTokens', JSON.stringify(payload));
        }
        setStatus(s => ({ ...s, zohoConnected: true }));
      }
    };
    
    const channel = new BroadcastChannel('oauth_channel');
    const handleChannelMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS' || event.data?.type === 'ZOHO_AUTH_SUCCESS') {
        handleAuthSuccess(event.data.type, event.data.payload);
      }
    };
    channel.addEventListener('message', handleChannelMessage);

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS' || event.data?.type === 'ZOHO_AUTH_SUCCESS') {
        handleAuthSuccess(event.data.type, event.data.payload);
      }
    };
    window.addEventListener('message', handleMessage);

    // Storage event fallback
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'oauth_event' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          if (data.type === 'GOOGLE_AUTH_SUCCESS' || data.type === 'ZOHO_AUTH_SUCCESS') {
            handleAuthSuccess(data.type, data.payload);
          }
        } catch (e) {}
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
      channel.removeEventListener('message', handleChannelMessage);
      channel.close();
    };
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setStatus(s => ({
        ...s,
        config: data.config
      }));
    } catch (err) {
      console.error('Failed to fetch status');
    }
  };

  const fetchSheets = async () => {
    const tokens = googleTokens || JSON.parse(localStorage.getItem('googleTokens') || 'null');
    if (!tokens) return;
    setLoadingSheets(true);
    try {
      const res = await fetch('/api/sheets', {
        headers: {
          'Authorization': `Bearer ${btoa(JSON.stringify(tokens))}`
        }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setSheets(data);
      } else if (data.error) {
        setError(`Google Sheets Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Failed to fetch sheets');
      setError('Failed to fetch spreadsheets from Google Drive');
    } finally {
      setLoadingSheets(false);
    }
  };

  const handleConnect = async (service: 'google' | 'zoho') => {
    try {
      const res = await fetch(`/api/auth/${service}/url`);
      const { url } = await res.json();
      window.open(url, `${service}_auth`, 'width=600,height=700');
    } catch (err) {
      setError(`Failed to connect to ${service}`);
    }
  };

  const handleSheetSelect = async (id: string) => {
    const tokens = googleTokens || JSON.parse(localStorage.getItem('googleTokens') || 'null');
    if (!tokens) return;
    setSelectedSheet(id);
    try {
      const res = await fetch(`/api/sheets/${id}/data`, {
        headers: {
          'Authorization': `Bearer ${btoa(JSON.stringify(tokens))}`
        }
      });
      const data = await res.json();
      setSheetData(data);
      if (data.length > 1) {
        setSelectedRows(data.slice(1).map((_: any, i: number) => i));
      } else {
        setSelectedRows([]);
      }
      // Auto-map if headers match
      if (data.length > 0) {
        const headers = data[0];
        const newMapping = { ...mapping };
        headers.forEach((h: string) => {
          if (h.toLowerCase().includes('first')) newMapping['First_Name'] = h;
          if (h.toLowerCase().includes('last')) newMapping['Last_Name'] = h;
          if (h.toLowerCase().includes('email')) newMapping['Email'] = h;
          if (h.toLowerCase().includes('company')) newMapping['Company'] = h;
          if (h.toLowerCase().includes('title') || h.toLowerCase().includes('designation') || h.toLowerCase().includes('position')) newMapping['Position'] = h;
          if (h.toLowerCase().includes('mobile') || h.toLowerCase().includes('phone')) newMapping['Mobile'] = h;
        });
        setMapping(newMapping);
      }
    } catch (err) {
      setError('Failed to fetch sheet data');
    }
  };

  const fetchZohoMetadata = async (tokens: any) => {
    try {
      const res = await fetch('/api/zoho/metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ zohoTokens: tokens })
      });
      const data = await res.json();
      if (res.status === 401) {
        setError(data.error || 'Zoho session expired. Please reconnect.');
        setZohoTokens(null);
        setStatus(s => ({ ...s, zohoConnected: false }));
        localStorage.removeItem('zohoTokens');
        return;
      }
      if (!data.error) {
        setZohoMetadata(data);
        if (data.zohoTokens) {
          setZohoTokens(data.zohoTokens);
          localStorage.setItem('zohoTokens', JSON.stringify(data.zohoTokens));
        }
      }
    } catch (err) {
      console.error('Failed to fetch Zoho metadata');
    }
  };

  useEffect(() => {
    if (zohoTokens && !zohoMetadata) {
      fetchZohoMetadata(zohoTokens);
    }
  }, [zohoTokens]);

  const handleManualSync = async () => {
    if (!zohoTokens) {
      setError('Please connect Zoho CRM first');
      return;
    }
    
    if (!manualLead['Last_Name']) {
      setError('Last Name is required for Zoho CRM');
      return;
    }

    setManualSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch('/api/sync-manual', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          leadData: manualLead,
          fixedValues: manualFixedValues,
          zohoTokens
        }),
      });
      const data = await res.json();
      if (res.status === 401 && (data.error?.includes('Zoho session expired') || data.error?.includes('Zoho permissions changed'))) {
        setError(data.error);
        setZohoTokens(null);
        setStatus(s => ({ ...s, zohoConnected: false }));
        localStorage.removeItem('zohoTokens');
      } else if (!res.ok) {
        throw new Error(data.error || 'Failed to sync lead');
      } else {
        setSyncResult({
          success: data.success,
          synced: data.synced,
          errors: data.errors,
          details: data.details
        });
        if (data.zohoTokens) {
          setZohoTokens(data.zohoTokens);
          localStorage.setItem('zohoTokens', JSON.stringify(data.zohoTokens));
        }
        // Reset form on success
        if (data.synced > 0) {
          setManualLead({
            'First_Name': '',
            'Last_Name': '',
            'Email': '',
            'Company': '',
            'Position': '',
            'Mobile': '',
          });
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during sync');
    } finally {
      setManualSyncing(false);
    }
  };

  const handleSync = async () => {
    if (!googleTokens || !zohoTokens) {
      setError('Please connect both Google and Zoho');
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          spreadsheetId: selectedSheet, 
          mapping,
          fixedValues,
          selectedRows,
          updateExisting,
          duplicateCheckField,
          googleTokens,
          zohoTokens
        }),
      });
      const data = await res.json();
      if (res.status === 401 && (data.error?.includes('Zoho session expired') || data.error?.includes('Zoho permissions changed'))) {
        setError(data.error);
        setZohoTokens(null);
        setStatus(s => ({ ...s, zohoConnected: false }));
        localStorage.removeItem('zohoTokens');
        return;
      }
      if (data.success) {
        setSyncResult(data.zohoResponse);
        if (data.zohoTokens) {
          setZohoTokens(data.zohoTokens);
          localStorage.setItem('zohoTokens', JSON.stringify(data.zohoTokens));
        }
      } else {
        setError(data.error || 'Sync failed');
      }
    } catch (err) {
      setError('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const testZohoConnection = async () => {
    if (!zohoTokens) {
      setError('Please connect Zoho first');
      return;
    }
    setTestingZoho(true);
    setError(null);
    try {
      const res = await fetch('/api/zoho/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ zohoTokens })
      });
      const data = await res.json();
      if (res.status === 401 && (data.error?.includes('Zoho session expired') || data.error?.includes('Zoho permissions changed'))) {
        setError(data.error);
        setZohoTokens(null);
        setStatus(s => ({ ...s, zohoConnected: false }));
        localStorage.removeItem('zohoTokens');
        return;
      }
      if (data.error) {
        setError(data.details ? `${data.error}: ${JSON.stringify(data.details)}` : data.error);
      } else {
        setTestLeads(data.data || []);
        setActiveTab('leads');
        if (data.zohoTokens) {
          setZohoTokens(data.zohoTokens);
          localStorage.setItem('zohoTokens', JSON.stringify(data.zohoTokens));
        }
      }
    } catch (err) {
      setError('Failed to fetch leads from Zoho');
    } finally {
      setTestingZoho(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      localStorage.removeItem('googleTokens');
      localStorage.removeItem('zohoTokens');
      setGoogleTokens(null);
      setZohoTokens(null);
      setStatus({ 
        googleConnected: false, 
        zohoConnected: false,
        config: status.config
      });
      setSheets([]);
      setSelectedSheet('');
      setSheetData([]);
    } catch (err) {
      console.error('Logout failed');
    }
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
    localStorage.setItem('isAuthenticated', 'true');
  };

  const handleSignOut = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('isAuthenticated');
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1e293b] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-200">
            <RefreshCw className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">Sheet2Zoho Sync</h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleSignOut}
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
          <div className="flex items-center gap-2">
            {(status.googleConnected || status.zohoConnected) && (
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Disconnect
              </button>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full text-xs font-medium text-slate-600">
              <span className={`w-2 h-2 rounded-full ${status.googleConnected ? 'bg-green-500' : 'bg-slate-300'}`} />
              Google
              <span className="mx-1 text-slate-300">|</span>
              <span className={`w-2 h-2 rounded-full ${status.zohoConnected ? 'bg-green-500' : 'bg-slate-300'}`} />
              Zoho
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-8">
        {/* Config Check Banner */}
        {status.config && (!status.config.google || !status.config.zoho || !status.config.appUrl) && (
          <div className="mb-8 bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-amber-600 mt-0.5" />
            <div>
              <h3 className="font-bold text-amber-800">Configuration Required</h3>
              <p className="text-sm text-amber-700 mb-3">Some environment variables are missing in the AI Studio Secrets panel.</p>
              <div className="flex flex-wrap gap-3">
                <ConfigBadge label="Google Client" active={status.config.google} />
                <ConfigBadge label="Zoho Client" active={status.config.zoho} />
                <ConfigBadge label="App URL" active={status.config.appUrl} />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Sidebar: Connections */}
          <div className="space-y-6">
            <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Connections</h2>
              <div className="space-y-3">
                <button 
                  onClick={() => handleConnect('google')}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${status.googleConnected ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50'}`}
                >
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className={`w-5 h-5 ${status.googleConnected ? 'text-green-600' : 'text-slate-400'}`} />
                    <span className="font-medium">Google Sheets</span>
                  </div>
                  {status.googleConnected ? <CheckCircle2 className="w-5 h-5" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                <button 
                  onClick={() => handleConnect('zoho')}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${status.zohoConnected ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50'}`}
                >
                  <div className="flex items-center gap-3">
                    <Database className={`w-5 h-5 ${status.zohoConnected ? 'text-green-600' : 'text-slate-400'}`} />
                    <span className="font-medium">Zoho CRM</span>
                  </div>
                  {status.zohoConnected ? <CheckCircle2 className="w-5 h-5" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {status.zohoConnected && (
                  <button
                    onClick={testZohoConnection}
                    disabled={testingZoho}
                    className="w-full mt-2 py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {testingZoho ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                    {testingZoho ? 'Fetching...' : 'Test Connection (Fetch Leads)'}
                  </button>
                )}
              </div>
            </section>

            {status.googleConnected && (
              <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Source Sheet</h2>
                  <button 
                    onClick={fetchSheets}
                    className="p-1 hover:bg-slate-100 rounded-full transition-colors"
                    title="Refresh Sheets"
                  >
                    <RefreshCw className={`w-4 h-4 text-slate-400 ${loadingSheets ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                  {loadingSheets ? (
                    <div className="flex flex-col items-center py-8 text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                      <span className="text-xs">Loading sheets...</span>
                    </div>
                  ) : sheets.length > 0 ? (
                    sheets.map(sheet => (
                      <button
                        key={sheet.id}
                        onClick={() => handleSheetSelect(sheet.id)}
                        className={`w-full text-left p-3 rounded-lg text-sm transition-colors ${selectedSheet === sheet.id ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-100 text-slate-700'}`}
                      >
                        {sheet.name}
                      </button>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-xs text-slate-400 italic mb-2">No spreadsheets found.</p>
                      <p className="text-[10px] text-slate-400">Make sure you have Google Sheets in your Drive.</p>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Main Content: Mapping & Sync */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex border-b border-slate-200 mb-6">
              <button
                onClick={() => setActiveTab('mapping')}
                className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors ${activeTab === 'mapping' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                Data Mapping
              </button>
              <button
                onClick={() => setActiveTab('select')}
                className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors ${activeTab === 'select' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                Select Leads
              </button>
              <button
                onClick={() => setActiveTab('leads')}
                className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors ${activeTab === 'leads' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                Fetched Leads
              </button>
              <button
                onClick={() => setActiveTab('manual')}
                className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors ${activeTab === 'manual' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                Manual Entry
              </button>
            </div>

            {activeTab === 'mapping' && (
              !selectedSheet ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 flex flex-col items-center justify-center text-center">
                  <div className="bg-slate-50 p-4 rounded-full mb-4">
                    <FileSpreadsheet className="w-12 h-12 text-slate-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">Select a Spreadsheet</h3>
                  <p className="text-slate-500 max-w-xs">Connect your Google account and choose a sheet to start mapping data to Zoho CRM.</p>
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  {/* Mapping Table */}
                  <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">Field Mapping</h2>
                      <p className="text-sm text-slate-500">Map Zoho CRM Lead fields to your Sheet columns.</p>
                    </div>
                    <Settings className="w-5 h-5 text-slate-400" />
                  </div>
                  
                  <div className="p-6 space-y-4">
                    {Object.keys(mapping).map(zohoField => (
                      <div key={zohoField} className="flex items-center gap-4">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{zohoField.replace('_', ' ')}</label>
                          <div className="bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium border border-slate-100">
                            Zoho Field
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 mt-5" />
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Sheet Column</label>
                          <select
                            value={mapping[zohoField]}
                            onChange={(e) => setMapping({ ...mapping, [zohoField]: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          >
                            <option value="">Select Column...</option>
                            {sheetData[0]?.map((header: string) => (
                              <option key={header} value={header}>{header}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-6 border-t border-slate-100 space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 mb-4">Fixed Values (Applied to all synced leads)</h3>
                    
                    {/* Lead Status */}
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Lead Status</label>
                        <div className="bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium border border-slate-100">
                          Zoho Field
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300 mt-5" />
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Fixed Value</label>
                        <select
                          value={fixedValues['Lead_Status']}
                          onChange={(e) => setFixedValues({ ...fixedValues, 'Lead_Status': e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          <option value="">Select Status...</option>
                          {zohoMetadata?.leadStatus.map((opt: any) => (
                            <option key={opt.actual_value} value={opt.actual_value}>{opt.display_value}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Lead Source */}
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Lead Source</label>
                        <div className="bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium border border-slate-100">
                          Zoho Field
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300 mt-5" />
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Fixed Value</label>
                        <select
                          value={fixedValues['Lead_Source']}
                          onChange={(e) => setFixedValues({ ...fixedValues, 'Lead_Source': e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          <option value="">Select Source...</option>
                          {zohoMetadata?.leadSource.map((opt: any) => (
                            <option key={opt.actual_value} value={opt.actual_value}>{opt.display_value}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Owner */}
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Lead Owner</label>
                        <div className="bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium border border-slate-100">
                          Zoho Field
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300 mt-5" />
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Fixed Value</label>
                        <select
                          value={fixedValues['Owner']}
                          onChange={(e) => setFixedValues({ ...fixedValues, 'Owner': e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          <option value="">Select Owner...</option>
                          {zohoMetadata?.users.map((user: any) => (
                            <option key={user.id} value={user.id}>{user.full_name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 border-t border-slate-100 space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 mb-4">Sync Options</h3>
                    <div className="flex items-start gap-3">
                      <input 
                        type="checkbox" 
                        id="updateExisting"
                        checked={updateExisting}
                        onChange={(e) => setUpdateExisting(e.target.checked)}
                        className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <label htmlFor="updateExisting" className="block text-sm font-medium text-slate-700">
                          Update existing leads
                        </label>
                        <p className="text-xs text-slate-500 mt-1">If a lead already exists, update its information instead of creating a duplicate.</p>
                        
                        {updateExisting && (
                          <div className="mt-3">
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Match By Field</label>
                            <select
                              value={duplicateCheckField}
                              onChange={(e) => setDuplicateCheckField(e.target.value)}
                              className="w-64 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                              <option value="Email">Email</option>
                              <option value="Phone">Phone</option>
                              <option value="Mobile">Mobile</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <div className="text-sm text-slate-500">
                      {sheetData.length > 0 ? `${sheetData.length - 1} records found` : 'No data rows'}
                    </div>
                    <button
                      onClick={() => setActiveTab('select')}
                      disabled={!status.zohoConnected}
                      className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all shadow-lg ${!status.zohoConnected ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 active:scale-95'}`}
                    >
                      Next: Select Leads <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </section>

              </motion.div>
              )
            )}

            {activeTab === 'select' && (
              !selectedSheet ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 flex flex-col items-center justify-center text-center">
                  <div className="bg-slate-50 p-4 rounded-full mb-4">
                    <FileSpreadsheet className="w-12 h-12 text-slate-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">Select a Spreadsheet</h3>
                  <p className="text-slate-500 max-w-xs">Connect your Google account and choose a sheet to preview and select leads.</p>
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
                >
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">Select Leads</h2>
                      <p className="text-sm text-slate-500">Choose which rows to sync to Zoho CRM.</p>
                    </div>
                    <div className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                      {selectedRows.length} / {Math.max(0, sheetData.length - 1)} Selected
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-[500px]">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="p-4 w-12">
                            <input 
                              type="checkbox" 
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              checked={selectedRows.length === Math.max(0, sheetData.length - 1) && sheetData.length > 1}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRows(sheetData.slice(1).map((_, i) => i));
                                } else {
                                  setSelectedRows([]);
                                }
                              }}
                            />
                          </th>
                          {sheetData[0]?.map((header: string, i: number) => (
                            <th key={i} className="p-4 font-medium whitespace-nowrap">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sheetData.slice(1).map((row, rowIndex) => (
                          <tr key={rowIndex} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4">
                              <input 
                                type="checkbox" 
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                checked={selectedRows.includes(rowIndex)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRows([...selectedRows, rowIndex]);
                                  } else {
                                    setSelectedRows(selectedRows.filter(id => id !== rowIndex));
                                  }
                                }}
                              />
                            </td>
                            {sheetData[0]?.map((_, colIndex) => (
                              <td key={colIndex} className="p-4 text-slate-600 whitespace-nowrap max-w-[200px] truncate">
                                {row[colIndex] || '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {sheetData.length <= 1 && (
                          <tr>
                            <td colSpan={(sheetData[0]?.length || 0) + 1} className="p-8 text-center text-slate-500">
                              No data rows found in this sheet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between mt-auto">
                    <div className="text-sm text-slate-500">
                      {selectedRows.length} records selected
                    </div>
                    <button
                      onClick={handleSync}
                      disabled={syncing || !status.zohoConnected || selectedRows.length === 0}
                      className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all shadow-lg ${(syncing || selectedRows.length === 0) ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 active:scale-95'}`}
                    >
                      {syncing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                      {syncing ? 'Syncing...' : 'Start Sync'}
                    </button>
                  </div>
                </motion.div>
              )
            )}

            {activeTab === 'leads' && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-slate-800">Recent Leads from Zoho</h3>
                    <button onClick={testZohoConnection} disabled={testingZoho} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                      {testingZoho ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Refresh
                    </button>
                  </div>
                  
                  {!testLeads ? (
                    <div className="text-center py-12 text-slate-500">
                      <Database className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                      <p>No leads fetched yet.</p>
                      <button 
                        onClick={testZohoConnection}
                        disabled={testingZoho || !status.zohoConnected}
                        className="mt-4 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Fetch Leads Now
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 bg-slate-50 uppercase">
                          <tr>
                            <th className="px-4 py-2 rounded-tl-lg">Name</th>
                            <th className="px-4 py-2">Company</th>
                            <th className="px-4 py-2">Email</th>
                            <th className="px-4 py-2 rounded-tr-lg">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {testLeads.length === 0 ? (
                            <tr><td colSpan={4} className="text-center py-4 text-slate-500">No leads found in Zoho CRM.</td></tr>
                          ) : (
                            testLeads.map((lead: any, idx: number) => (
                              <tr key={lead.id || idx} className="border-b border-slate-100 last:border-0">
                                <td className="px-4 py-3 font-medium text-slate-800">{lead.First_Name} {lead.Last_Name}</td>
                                <td className="px-4 py-3 text-slate-600">{lead.Company || '-'}</td>
                                <td className="px-4 py-3 text-slate-600">{lead.Email || '-'}</td>
                                <td className="px-4 py-3">
                                  <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs">{lead.Lead_Status || 'New'}</span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'manual' && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-6">Manual Lead Entry</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {Object.keys(manualLead).map((field) => (
                      <div key={field}>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          {field.replace('_', ' ')} {field === 'Last_Name' && <span className="text-red-500">*</span>}
                        </label>
                        <input
                          type="text"
                          value={manualLead[field]}
                          onChange={(e) => setManualLead({ ...manualLead, [field]: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder={`Enter ${field.replace('_', ' ')}`}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-slate-100 pt-8 mb-8">
                    <h3 className="text-sm font-bold text-slate-800 mb-4">Fixed Values (Applied to this lead)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Lead Status</label>
                        <select
                          value={manualFixedValues['Lead_Status']}
                          onChange={(e) => setManualFixedValues({ ...manualFixedValues, 'Lead_Status': e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        >
                          <option value="">Select Status...</option>
                          {zohoMetadata?.leadStatus.map((opt: any) => (
                            <option key={opt.actual_value} value={opt.actual_value}>{opt.display_value}</option>
                          ))}
                          {!zohoMetadata && <option value="New Lead">New Lead</option>}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Lead Source</label>
                        <select
                          value={manualFixedValues['Lead_Source']}
                          onChange={(e) => setManualFixedValues({ ...manualFixedValues, 'Lead_Source': e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        >
                          <option value="">Select Source...</option>
                          {zohoMetadata?.leadSource.map((opt: any) => (
                            <option key={opt.actual_value} value={opt.actual_value}>{opt.display_value}</option>
                          ))}
                          {!zohoMetadata && <option value="Whatsapp Marketing">Whatsapp Marketing</option>}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Lead Owner</label>
                        <select
                          value={manualFixedValues['Owner']}
                          onChange={(e) => setManualFixedValues({ ...manualFixedValues, 'Owner': e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        >
                          <option value="">Select Owner...</option>
                          {zohoMetadata?.users.map((opt: any) => (
                            <option key={opt.id} value={opt.id}>{opt.full_name}</option>
                          ))}
                          {!zohoMetadata && <option value="Rejna Balan">Rejna Balan</option>}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={handleManualSync}
                      disabled={manualSyncing || !status.zohoConnected}
                      className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all shadow-lg ${(manualSyncing || !status.zohoConnected) ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 active:scale-95'}`}
                    >
                      {manualSyncing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                      {manualSyncing ? 'Syncing...' : 'Send to Zoho CRM'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Results/Errors */}
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3 text-red-700"
                >
                  <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-bold">Error</p>
                    <p className="text-sm opacity-90">{error}</p>
                  </div>
                </motion.div>
              )}

              {syncResult && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-green-50 border border-green-200 p-6 rounded-2xl"
                >
                  <div className="flex items-center gap-3 text-green-700 mb-4">
                    <CheckCircle2 className="w-6 h-6" />
                    <h3 className="text-lg font-bold">Sync Completed Successfully!</h3>
                  </div>
                  <div className="space-y-2">
                    {syncResult.data?.map((res: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-white p-3 rounded-lg border border-green-100">
                        <span className="font-medium text-slate-600">Record {i + 1}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${res.code === 'SUCCESS' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {res.code}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Setup Instructions */}
      <footer className="max-w-5xl mx-auto px-8 pb-12">
        <div className="bg-slate-800 rounded-3xl p-8 text-white">
          <div className="flex items-center gap-3 mb-6">
            <Settings className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-bold">Configuration Guide</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-bold text-blue-400 mb-2">1. Google Cloud Setup</h3>
              <p className="text-sm text-slate-400 mb-4">Enable Sheets & Drive API. Add this callback URL:</p>
              <code className="block bg-slate-900 p-3 rounded-lg text-xs font-mono break-all border border-slate-700">
                {window.location.origin}/auth/google/callback
              </code>
            </div>
            <div>
              <h3 className="font-bold text-blue-400 mb-2">2. Zoho API Console</h3>
              <p className="text-sm text-slate-400 mb-4">Create a Server-based Application. Add this callback URL:</p>
              <code className="block bg-slate-900 p-3 rounded-lg text-xs font-mono break-all border border-slate-700">
                {window.location.origin}/auth/zoho/callback
              </code>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ConfigBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${active ? 'bg-green-100 border-green-200 text-green-700' : 'bg-red-100 border-red-200 text-red-700'}`}>
      {active ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      {label}
    </div>
  );
}
