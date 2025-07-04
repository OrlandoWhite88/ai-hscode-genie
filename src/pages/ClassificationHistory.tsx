 import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import Layout from '@/components/Layout';
import { getUserClassifications, deleteClassification, toggleClassificationFavorite, searchClassifications, ClassificationRecord, checkTariffChanges, getTariffChangeStats, acceptTariffChanges } from '@/lib/supabaseService';
import TariffInfo from '@/components/TariffInfo';
import { 
  Search, 
  Calendar, 
  Package, 
  Star, 
  Trash2, 
  Filter,
  AlertCircle,
  Loader2,
  Heart,
  Copy,
  X,
  Info,
  Clock,
  RefreshCw,
  Database,
  Calculator,
  CheckCircle,
  ArrowRight
} from 'lucide-react';
import CustomButton from '@/components/ui/CustomButton';
import { useToast } from '@/hooks/use-toast';

const ClassificationHistory = () => {
  const { userId } = useAuth();
  const { toast } = useToast();
  const [classifications, setClassifications] = useState<ClassificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'current' | 'needs_review' | 'changed'>('all');
  const [selectedClassification, setSelectedClassification] = useState<ClassificationRecord | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [checkingTariffs, setCheckingTariffs] = useState(false);
  const [tariffStats, setTariffStats] = useState({ total: 0, changed: 0, needsReview: 0, recentChanges: 0 });
  const [acceptingChanges, setAcceptingChanges] = useState(false);

  useEffect(() => {
    if (userId) {
      loadClassifications();
    }
  }, [userId]);

  const loadClassifications = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      const data = await getUserClassifications(userId);
      setClassifications(data);
      
      // Load tariff stats
      const stats = await getTariffChangeStats(userId);
      setTariffStats(stats);
      
      // Check for tariff changes on page load (on-demand checking)
      checkTariffsInBackground();
    } catch (error) {
      console.error('Error loading classifications:', error);
      toast({
        title: "Error",
        description: "Failed to load classification history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const checkTariffsInBackground = async () => {
    if (!userId || checkingTariffs) return;
    
    setCheckingTariffs(true);
    try {
      console.log('Checking for tariff changes...');
      const result = await checkTariffChanges(userId);
      
      if (result.changed > 0 || result.discontinued > 0) {
        let message = '';
        if (result.changed > 0 && result.discontinued > 0) {
          message = `${result.changed} classification${result.changed > 1 ? 's have' : ' has'} tariff changes and ${result.discontinued} HS code${result.discontinued > 1 ? 's are' : ' is'} discontinued.`;
        } else if (result.changed > 0) {
          message = `${result.changed} classification${result.changed > 1 ? 's have' : ' has'} tariff changes that need review.`;
        } else {
          message = `${result.discontinued} HS code${result.discontinued > 1 ? 's are' : ' is'} discontinued and need${result.discontinued === 1 ? 's' : ''} reclassification.`;
        }
        
        toast({
          title: "Changes Detected",
          description: message,
          variant: "default",
        });
        
        // Reload classifications to show updated data
        const updatedData = await getUserClassifications(userId);
        setClassifications(updatedData);
        
        // Update stats
        const updatedStats = await getTariffChangeStats(userId);
        setTariffStats(updatedStats);
      }
      
      console.log(`Tariff check completed: ${result.checked} checked, ${result.changed} changed, ${result.discontinued} discontinued, ${result.errors} errors`);
    } catch (error) {
      console.error('Error checking tariff changes:', error);
    } finally {
      setCheckingTariffs(false);
    }
  };

  const handleRefresh = async () => {
    await loadClassifications();
  };

  const handleSearch = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      const data = searchTerm 
        ? await searchClassifications(userId, searchTerm)
        : await getUserClassifications(userId);
      setClassifications(data);
    } catch (error) {
      console.error('Error searching classifications:', error);
      toast({
        title: "Error",
        description: "Failed to search classifications",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this classification?')) return;
    
    try {
      const success = await deleteClassification(id);
      if (success) {
        setClassifications(prev => prev.filter(c => c.id !== id));
        toast({
          title: "Success",
          description: "Classification deleted successfully",
        });
      } else {
        throw new Error('Failed to delete');
      }
    } catch (error) {
      console.error('Error deleting classification:', error);
      toast({
        title: "Error",
        description: "Failed to delete classification",
        variant: "destructive",
      });
    }
  };

  const handleToggleFavorite = async (id: string, currentFavorite: boolean) => {
    try {
      const updated = await toggleClassificationFavorite(id, !currentFavorite);
      if (updated) {
        setClassifications(prev => 
          prev.map(c => c.id === id ? { ...c, is_favorite: !currentFavorite } : c)
        );
        toast({
          title: "Success",
          description: `Classification ${!currentFavorite ? 'added to' : 'removed from'} favorites`,
        });
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast({
        title: "Error",
        description: "Failed to update favorite status",
        variant: "destructive",
      });
    }
  };

  const handleAcceptTariffChanges = async (classificationId: string) => {
    setAcceptingChanges(true);
    try {
      const result = await acceptTariffChanges(classificationId);
      if (result) {
        // Update the classification in the local state
        setClassifications(prev => 
          prev.map(c => c.id === classificationId ? {
            ...c,
            status: 'current',
            needs_review: false,
            previous_tariff_data: null,
            tariff_change_detected: null
          } : c)
        );
        
        // Update the selected classification if it's the one we just accepted
        if (selectedClassification?.id === classificationId) {
          setSelectedClassification(prev => prev ? {
            ...prev,
            status: 'current',
            needs_review: false,
            previous_tariff_data: null,
            tariff_change_detected: null
          } : null);
        }
        
        toast({
          title: "Changes Accepted",
          description: "Tariff changes have been accepted and the classification is now current.",
        });
        
        // Reload stats
        const updatedStats = await getTariffChangeStats(userId!);
        setTariffStats(updatedStats);
      } else {
        throw new Error('Failed to accept changes');
      }
    } catch (error) {
      console.error('Error accepting tariff changes:', error);
      toast({
        title: "Error",
        description: "Failed to accept tariff changes",
        variant: "destructive",
      });
    } finally {
      setAcceptingChanges(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  const filteredClassifications = classifications.filter(c => {
    // Search filter
    const matchesSearch = c.product_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         c.hs_code.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    // Filter by favorites
    if (showFavoritesOnly && !c.is_favorite) return false;
    
    // Filter by status
    if (statusFilter !== 'all') {
      const needsReview = c.needs_review || new Date(c.classification_date!) < new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
      
      switch (statusFilter) {
        case 'current':
          return !needsReview && c.status !== 'changed';
        case 'needs_review':
          return needsReview;
        case 'changed':
          return c.status === 'changed';
        default:
          return true;
      }
    }
    
    return true;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!userId) {
    return (
      <Layout className="pt-28 pb-16">
        <div className="max-w-4xl mx-auto text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Sign In Required</h1>
          <p className="text-gray-600">Please sign in to view your classification history.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout className="pt-28 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Classification History</h1>
            <p className="text-gray-600">
              View and manage your past HS code classifications
            </p>
          </div>
          <CustomButton
            variant="outline"
            onClick={handleRefresh}
            disabled={checkingTariffs}
            className="flex items-center"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${checkingTariffs ? 'animate-spin' : ''}`} />
            {checkingTariffs ? 'Checking Tariffs...' : 'Refresh'}
          </CustomButton>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-5 w-5 text-blue-600" />
              <h3 className="font-medium text-blue-800">Total Classifications</h3>
            </div>
            <div className="text-2xl font-bold text-blue-900">
              {classifications.length}
            </div>
            <p className="text-sm text-blue-600">
              All time classifications
            </p>
          </div>

          <div className={`bg-gradient-to-br p-4 rounded-lg ${
            classifications.filter(c => c.needs_review || new Date(c.classification_date!) < new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)).length > 0
              ? 'from-red-50 to-red-100 border border-red-200'
              : 'from-gray-50 to-gray-100 border border-gray-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className={`h-5 w-5 ${
                classifications.filter(c => c.needs_review || new Date(c.classification_date!) < new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)).length > 0
                  ? 'text-red-600'
                  : 'text-gray-600'
              }`} />
              <h3 className={`font-medium ${
                classifications.filter(c => c.needs_review || new Date(c.classification_date!) < new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)).length > 0
                  ? 'text-red-800'
                  : 'text-gray-800'
              }`}>Needs Review</h3>
            </div>
            <div className={`text-2xl font-bold ${
              classifications.filter(c => c.needs_review || new Date(c.classification_date!) < new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)).length > 0
                ? 'text-red-900'
                : 'text-gray-900'
            }`}>
              {classifications.filter(c => c.needs_review || new Date(c.classification_date!) < new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)).length}
            </div>
            <p className={`text-sm ${
              classifications.filter(c => c.needs_review || new Date(c.classification_date!) < new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)).length > 0
                ? 'text-red-600'
                : 'text-gray-600'
            }`}>
              Tariff changes or HS code changes
            </p>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-green-600" />
              <h3 className="font-medium text-green-800">Last Updated</h3>
            </div>
            <div className="text-xl font-bold text-green-900">
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
            <p className="text-sm text-green-600">
              HTS Revision: 2024
            </p>
          </div>
        </div>


        {/* Search and Filters */}
        <div className="bg-white border border-gray-200 p-6 rounded-lg mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by product description, HS code, or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <CustomButton onClick={handleSearch} className="flex items-center">
              <Search className="h-4 w-4 mr-2" />
              Search
            </CustomButton>
          </div>
          
          <div className="flex items-center gap-4 mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showFavoritesOnly}
                onChange={(e) => setShowFavoritesOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Star className="h-4 w-4" />
              <span className="text-sm">Favorites only</span>
            </label>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
              >
                <option value="all">All Status</option>
                <option value="current">Current</option>
                <option value="needs_review">Needs Review</option>
                <option value="changed">Changed</option>
              </select>
            </div>
            
            <div className="text-sm text-gray-500">
              {filteredClassifications.length} classification{filteredClassifications.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Main Content Area with Sidebar */}
        <div className="relative">
          {/* Classifications Table */}
          {loading ? (
            <div className="bg-white border border-gray-200 p-8 rounded-lg text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>Loading your classifications...</p>
            </div>
          ) : filteredClassifications.length === 0 ? (
            <div className="bg-white border border-gray-200 p-8 rounded-lg text-center">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">
                {searchTerm || showFavoritesOnly ? 'No matching classifications found' : 'No classifications yet'}
              </h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || showFavoritesOnly 
                  ? 'Try adjusting your search or filters'
                  : 'Start classifying products to build your history'
                }
              </p>
              {!searchTerm && !showFavoritesOnly && (
                <CustomButton onClick={() => window.location.href = '/'}>
                  Start Classifying
                </CustomButton>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      HS Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Calculate Tariff
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredClassifications.map((classification) => (
                    <tr 
                      key={classification.id} 
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${
                        selectedClassification?.id === classification.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => {
                        setSelectedClassification(classification);
                        setSidebarOpen(true);
                      }}
                    >
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate max-w-xs">
                              {classification.product_description}
                            </div>
                            {classification.notes && (
                              <div className="text-xs text-gray-500 truncate max-w-xs">
                                {classification.notes}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {classification.is_favorite && (
                              <Star className="h-3 w-3 text-yellow-500 fill-current" />
                            )}
                            {/* Status indicator dot */}
                            <div className={`w-2 h-2 rounded-full ${
                              classification.status === 'discontinued'
                                ? 'bg-red-600'
                                : classification.needs_review || new Date(classification.classification_date!) < new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
                                ? 'bg-yellow-500' 
                                : classification.status === 'changed'
                                ? 'bg-red-500'
                                : 'bg-green-500'
                            }`} />
                            {/* Discontinued badge */}
                            {classification.status === 'discontinued' && (
                              <span className="px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded">
                                Discontinued
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-blue-600">
                            {classification.hs_code}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(classification.hs_code, 'HS Code');
                            }}
                            className="opacity-60 hover:opacity-100 text-gray-400 hover:text-gray-600"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          {formatDate(classification.classification_date!)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.location.href = `/tariff-calculator?hsCode=${encodeURIComponent(classification.hs_code)}`;
                          }}
                          className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs"
                        >
                          <Calculator className="h-3 w-3" />
                          Calculate
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFavorite(classification.id!, classification.is_favorite || false);
                            }}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <Heart className={`h-4 w-4 ${classification.is_favorite ? 'text-red-500 fill-current' : ''}`} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedClassification(classification);
                              setSidebarOpen(true);
                            }}
                            className="text-gray-400 hover:text-blue-500"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(classification.id!);
                            }}
                            className="text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Right Sidebar */}
          {sidebarOpen && selectedClassification && (
            <div className="fixed inset-y-0 right-0 w-full sm:w-1/2 lg:w-1/3 xl:w-1/3 bg-white border-l border-gray-200 shadow-lg z-50 overflow-y-auto">
              <div className="p-6">
                {/* Sidebar Header */}
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold">Classification Details</h3>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Product Information */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Product Description</label>
                    <p className="text-sm mt-1 bg-gray-50 p-3 rounded-md">
                      {selectedClassification.product_description}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-500">HS Code</label>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xl font-mono font-bold text-blue-600">
                        {selectedClassification.hs_code}
                      </span>
                      <button
                        onClick={() => copyToClipboard(selectedClassification.hs_code, 'HS Code')}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Date</label>
                      <p className="text-sm mt-1">
                        {formatDate(selectedClassification.classification_date!)}
                      </p>
                    </div>
                    {selectedClassification.confidence && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Confidence</label>
                        <p className="text-sm mt-1">
                          {Math.round(selectedClassification.confidence)}%
                        </p>
                      </div>
                    )}
                  </div>

                  {selectedClassification.notes && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Notes</label>
                      <p className="text-sm mt-1 bg-gray-50 p-3 rounded-md">
                        {selectedClassification.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Tariff Change Comparison - Show if status is 'changed' */}
                {selectedClassification.status === 'changed' && selectedClassification.previous_tariff_data && (
                  <div className="mb-6">
                    <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="h-5 w-5 text-red-600" />
                        <h4 className="font-medium text-red-800">Tariff Changes Detected</h4>
                      </div>
                      
                      <p className="text-sm text-red-700 mb-4">
                        Changes were detected on {selectedClassification.tariff_change_detected ? 
                          formatDate(selectedClassification.tariff_change_detected) : 'recently'}. 
                        Review the changes below and accept them to update your classification.
                      </p>
                      
                      {/* Comparison Table */}
                      <div className="bg-white rounded-md border border-red-200 overflow-hidden mb-4">
                        <div className="grid grid-cols-3 gap-0 text-xs font-medium bg-red-100 text-red-800">
                          <div className="p-2 border-r border-red-200">Field</div>
                          <div className="p-2 border-r border-red-200">Previous</div>
                          <div className="p-2">Current</div>
                        </div>
                        
                        {/* Compare key tariff fields */}
                        {(() => {
                          const oldData = selectedClassification.previous_tariff_data;
                          const newData = selectedClassification.tariff_data;
                          const changedFields = [];
                          
                          // All possible tariff fields to check (matching backend logic)
                          const fieldsToCheck = [
                            { key: 'mfn_text_rate', label: 'MFN Text Rate' },
                            { key: 'mfn_ad_val_rate', label: 'MFN Ad Valorem Rate' },
                            { key: 'mfn_specific_rate', label: 'MFN Specific Rate' },
                            { key: 'mfn_other_rate', label: 'MFN Other Rate' },
                            { key: 'col2_text_rate', label: 'Column 2 Text Rate' },
                            { key: 'col2_ad_val_rate', label: 'Column 2 Ad Valorem Rate' },
                            { key: 'col2_specific_rate', label: 'Column 2 Specific Rate' },
                            { key: 'col2_other_rate', label: 'Column 2 Other Rate' },
                            { key: 'begin_effect_date', label: 'Begin Effective Date' },
                            { key: 'end_effective_date', label: 'End Effective Date' }
                          ];
                          
                          // Trade program indicators
                          const tradeProgramFields = [
                            { key: 'gsp_indicator', label: 'GSP Indicator' },
                            { key: 'cbi_indicator', label: 'CBI Indicator' },
                            { key: 'agoa_indicator', label: 'AGOA Indicator' },
                            { key: 'nafta_canada_ind', label: 'NAFTA Canada Indicator' },
                            { key: 'nafta_mexico_ind', label: 'NAFTA Mexico Indicator' },
                            { key: 'usmca_indicator', label: 'USMCA Indicator' },
                            { key: 'israel_fta_indicator', label: 'Israel FTA Indicator' },
                            { key: 'jordan_indicator', label: 'Jordan Indicator' },
                            { key: 'singapore_indicator', label: 'Singapore Indicator' },
                            { key: 'chile_indicator', label: 'Chile Indicator' },
                            { key: 'australia_indicator', label: 'Australia Indicator' },
                            { key: 'bahrain_indicator', label: 'Bahrain Indicator' },
                            { key: 'dr_cafta_indicator', label: 'DR-CAFTA Indicator' },
                            { key: 'oman_indicator', label: 'Oman Indicator' },
                            { key: 'peru_indicator', label: 'Peru Indicator' },
                            { key: 'korea_indicator', label: 'Korea Indicator' },
                            { key: 'columbia_indicator', label: 'Colombia Indicator' },
                            { key: 'panama_indicator', label: 'Panama Indicator' },
                            { key: 'morocco_indicator', label: 'Morocco Indicator' }
                          ];
                          
                          // Check all fields
                          [...fieldsToCheck, ...tradeProgramFields].forEach(field => {
                            const oldValue = oldData?.[field.key];
                            const newValue = newData?.[field.key];
                            
                            // Convert to strings for comparison to handle null/undefined/empty cases
                            const oldStr = oldValue === null || oldValue === undefined ? '' : String(oldValue);
                            const newStr = newValue === null || newValue === undefined ? '' : String(newValue);
                            
                            if (oldStr !== newStr) {
                              changedFields.push(
                                <div key={field.key} className="grid grid-cols-3 gap-0 text-xs border-t border-red-100">
                                  <div className="p-2 border-r border-red-100 font-medium">{field.label}</div>
                                  <div className="p-2 border-r border-red-100 text-red-600">
                                    {oldStr || 'N/A'}
                                  </div>
                                  <div className="p-2 text-green-600 font-medium">
                                    {newStr || 'N/A'}
                                  </div>
                                </div>
                              );
                            }
                          });
                          
                          // If no specific changes found, show a debug view
                          if (changedFields.length === 0) {
                            console.log('Debug - Old tariff data:', oldData);
                            console.log('Debug - New tariff data:', newData);
                            
                            return (
                              <div className="p-3 text-xs">
                                <div className="text-gray-500 text-center mb-3">
                                  No specific field changes detected in standard fields.
                                </div>
                                <div className="text-xs text-gray-400">
                                  <div className="mb-2"><strong>Debug Info:</strong></div>
                                  <div className="bg-gray-50 p-2 rounded text-xs font-mono max-h-32 overflow-y-auto">
                                    <div className="mb-1"><strong>Previous:</strong> {JSON.stringify(oldData, null, 2)}</div>
                                    <div><strong>Current:</strong> {JSON.stringify(newData, null, 2)}</div>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          
                          return changedFields;
                        })()}
                      </div>
                      
                      {/* Accept Changes Button */}
                      <div className="flex justify-end">
                        <CustomButton
                          onClick={() => handleAcceptTariffChanges(selectedClassification.id!)}
                          disabled={acceptingChanges}
                          className="flex items-center bg-green-600 hover:bg-green-700 text-white"
                        >
                          {acceptingChanges ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-2" />
                          )}
                          {acceptingChanges ? 'Accepting...' : 'Accept Changes'}
                        </CustomButton>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tariff Information */}
                <div>
                  <h4 className="font-medium mb-3">Tariff Information</h4>
                  <TariffInfo hsCode={selectedClassification.hs_code} />
                </div>
              </div>
            </div>
          )}

          {/* Sidebar Overlay */}
          {sidebarOpen && (
            <div 
              className="fixed inset-0 bg-black/20 z-40"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </div>
      </div>
    </Layout>
  );
};

export default ClassificationHistory;
