import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { simulationType, targetName } = body;
    const affectedCount = Math.floor(Math.random() * 20) + 3;
    const riskReduction = Math.random() * 0.5 + 0.4;
    const businessImpact = affectedCount > 10 ? 'critical' : affectedCount > 5 ? 'high' : 'medium';
    const rec = riskReduction > 0.7 && businessImpact !== 'critical'
      ? 'PROCEED - High risk reduction with manageable impact.'
      : riskReduction > 0.5
        ? 'CONDITIONAL - Significant risk reduction but requires scheduling.'
        : 'RECONSIDER - Low risk reduction suggests alternatives.';
    
    const impact = {
      affectedServices: affectedCount,
      affectedContainers: Math.floor(affectedCount / 3),
      affectedProcesses: Math.floor(affectedCount * 1.5),
      networkDependencies: Math.floor(affectedCount / 2),
    };
    
    const result = await db.simulationResult.create({
      data: {
        simulationType,
        targetId: targetName,
        targetName,
        predictedImpact: JSON.stringify(impact),
        affectedCount,
        riskReduction: Math.round(riskReduction * 100) / 100,
        businessImpact,
        recoveryRequired: affectedCount > 5,
        recommendation: rec,
      },
    });
    
    return NextResponse.json({
      ok: true,
      result: {
        id: result.id,
        simulationType,
        targetName,
        affectedCount,
        riskReduction: Math.round(riskReduction * 100) / 100,
        businessImpact,
        recoveryRequired: affectedCount > 5,
        recommendation: rec,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}