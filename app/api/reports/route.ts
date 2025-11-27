import { NextRequest, NextResponse } from 'next/server';
import * as cloud from '../../lib/cloud-storage';
import { DEFAULT_SUPPLIERS, findSupplierByZip } from '../../lib/suppliers';

export const dynamic = 'force-dynamic';

interface DailyStats {
  date: string;
  inboundCount: number;
  outboundCount: number;
  deliveredCount: number;
  exceptionsCount: number;
}

interface SupplierStats {
  supplierId: string;
  supplierName: string;
  shipmentCount: number;
  lastShipment?: string;
}

interface PerformanceMetrics {
  avgDeliveryDays: number;
  onTimeRate: number;
  exceptionRate: number;
  totalShipments: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const days = parseInt(searchParams.get('days') || '7');

  try {
    // Get all data
    const [inboundData, outboundData] = await Promise.all([
      cloud.getRecentInbound(),
      cloud.getRecentOutbound()
    ]);

    // Summary report
    if (action === 'summary' || !action) {
      const today = new Date().toISOString().split('T')[0];
      
      // Calculate daily breakdown for the last N days
      const dailyStats: DailyStats[] = [];
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayInbound = inboundData.filter(s => 
          s.timestamp && s.timestamp.startsWith(dateStr)
        );
        const dayOutbound = outboundData.filter(s => 
          s.tracking && s.timestamp?.startsWith(dateStr)
        );
        
        dailyStats.push({
          date: dateStr,
          inboundCount: dayInbound.length,
          outboundCount: dayOutbound.length,
          deliveredCount: dayInbound.filter(s => 
            s.status?.toLowerCase().includes('delivered') || 
            s.status?.toLowerCase().includes('complete')
          ).length,
          exceptionsCount: dayInbound.filter(s => 
            s.status?.toLowerCase().includes('exception') ||
            s.status?.toLowerCase().includes('delay')
          ).length
        });
      }

      // Supplier breakdown
      const supplierCounts: Record<string, number> = {};
      DEFAULT_SUPPLIERS.forEach(s => {
        supplierCounts[s.id] = 0;
      });

      // Performance metrics
      const totalInbound = inboundData.length;
      const totalOutbound = outboundData.length;
      const todayInbound = inboundData.filter(s => 
        s.timestamp && s.timestamp.startsWith(today)
      ).length;
      const todayOutbound = outboundData.filter(s => 
        s.timestamp?.startsWith(today)
      ).length;

      return NextResponse.json({
        summary: {
          totalInbound,
          totalOutbound,
          todayInbound,
          todayOutbound,
          lastUpdated: new Date().toISOString()
        },
        dailyStats: dailyStats.reverse(), // Oldest first for charts
        supplierStats: DEFAULT_SUPPLIERS.map(s => ({
          supplierId: s.id,
          supplierName: s.name,
          category: s.category,
          locations: s.zipCodes.length
        })),
        performance: {
          totalShipments: totalInbound + totalOutbound,
          avgDailyInbound: Math.round(totalInbound / Math.max(days, 1)),
          avgDailyOutbound: Math.round(totalOutbound / Math.max(days, 1)),
          exceptionsToday: dailyStats[0]?.exceptionsCount || 0
        }
      });
    }

    // Trend report
    if (action === 'trends') {
      const weeklyData: { week: string; inbound: number; outbound: number }[] = [];
      
      for (let i = 0; i < 4; i++) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - (i * 7) - 7);
        const weekEnd = new Date();
        weekEnd.setDate(weekEnd.getDate() - (i * 7));
        
        const weekLabel = `Week ${4 - i}`;
        
        const weekInbound = inboundData.filter(s => {
          if (!s.timestamp) return false;
          const scanDate = new Date(s.timestamp);
          return scanDate >= weekStart && scanDate < weekEnd;
        }).length;
        
        const weekOutbound = outboundData.filter(s => {
          if (!s.timestamp) return false;
          const scanDate = new Date(s.timestamp);
          return scanDate >= weekStart && scanDate < weekEnd;
        }).length;
        
        weeklyData.push({
          week: weekLabel,
          inbound: weekInbound,
          outbound: weekOutbound
        });
      }

      return NextResponse.json({
        weeklyTrends: weeklyData.reverse(),
        growthRate: {
          inbound: weeklyData.length >= 2 
            ? ((weeklyData[weeklyData.length - 1].inbound - weeklyData[0].inbound) / Math.max(weeklyData[0].inbound, 1) * 100).toFixed(1)
            : 0,
          outbound: weeklyData.length >= 2 
            ? ((weeklyData[weeklyData.length - 1].outbound - weeklyData[0].outbound) / Math.max(weeklyData[0].outbound, 1) * 100).toFixed(1)
            : 0
        }
      });
    }

    // Export data for reports
    if (action === 'export') {
      const format = searchParams.get('format') || 'json';
      
      const exportData = {
        generatedAt: new Date().toISOString(),
        period: `Last ${days} days`,
        inbound: inboundData.slice(0, 1000).map(s => ({
          tracking: s.tracking,
          po: s.po || '',
          timestamp: s.timestamp,
          status: s.status,
          shipper: s.shipper || ''
        })),
        outbound: outboundData.slice(0, 1000).map(s => ({
          tracking: s.tracking,
          recipient: s.recipient || '',
          city: s.city || '',
          state: s.state || '',
          service: s.service || '',
          location: s.location || ''
        }))
      };

      if (format === 'csv') {
        // Return CSV format
        const inboundCsv = [
          'Tracking,PO,Timestamp,Status,Shipper',
          ...exportData.inbound.map(r => 
            `"${r.tracking}","${r.po}","${r.timestamp}","${r.status}","${r.shipper}"`
          )
        ].join('\n');

        return new NextResponse(inboundCsv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename=shipment-report-${new Date().toISOString().split('T')[0]}.csv`
          }
        });
      }

      return NextResponse.json(exportData);
    }

    return NextResponse.json({ 
      message: 'Reports API',
      endpoints: [
        'GET ?action=summary - Get summary statistics',
        'GET ?action=trends - Get weekly trends',
        'GET ?action=export&format=json|csv - Export report data'
      ]
    });

  } catch (error) {
    console.error('Reports error:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}

