import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DiagnosticRepository,
  type DiagnosticSuiteReport,
  type PersistenceProbeState,
} from '../../database/repositories/diagnosticRepository';
import { TransactionRepository } from '../../database/repositories/transactionRepository';
import { databaseService } from '../../database/sqlite';
import type { DatabaseHealthInfo } from '../../database/types';
import type { PrintAttemptRecord } from '../../domain/types';
import {
  MockPrinterAdapter,
  type MockFailureMode,
} from '../../services/printer/mockPrinterAdapter';
import type {
  PrintExecutionResult,
  PrinterAdapterMetadata,
  PrinterConnectionSnapshot,
} from '../../services/printer/printerAdapter';
import type { FormattedReceiptDocument } from '../../services/printer/receiptFormatter';
import { ReceiptService } from '../../services/printer/receiptService';

const sharedMockPrinter = new MockPrinterAdapter();

export interface P1DiagnosticsViewModel {
  readonly isInitializing: boolean;
  readonly isBusy: boolean;
  readonly dbHealth: DatabaseHealthInfo | null;
  readonly suiteReport: DiagnosticSuiteReport | null;
  readonly persistenceState: PersistenceProbeState | null;
  readonly receiptPreview: FormattedReceiptDocument | null;
  readonly isReprintPreview: boolean;
  readonly printerMeta: PrinterAdapterMetadata;
  readonly printerConnection: PrinterConnectionSnapshot;
  readonly mockFailureMode: MockFailureMode;
  readonly lastPrintResult: PrintExecutionResult | null;
  readonly printAttempts: readonly PrintAttemptRecord[];
  readonly actionFeedback: string | null;
  readonly runDiagnosticSuite: () => Promise<void>;
  readonly savePersistenceSample: () => Promise<void>;
  readonly clearDiagnosticData: () => Promise<void>;
  readonly toggleReprintPreview: (isReprint: boolean) => Promise<void>;
  readonly connectMockPrinter: () => Promise<void>;
  readonly disconnectMockPrinter: () => Promise<void>;
  readonly changeMockFailureMode: (mode: MockFailureMode) => void;
  readonly simulatePrintSavedReceipt: (isReprint: boolean) => Promise<void>;
  readonly simulatePrintTestPage: () => Promise<void>;
}

export function useP1Diagnostics(): P1DiagnosticsViewModel {
  const diagnosticRepo = useMemo(
    () => new DiagnosticRepository(databaseService),
    [],
  );
  const txRepo = useMemo(() => new TransactionRepository(databaseService), []);
  const receiptService = useMemo(
    () => new ReceiptService(databaseService, sharedMockPrinter),
    [],
  );

  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [dbHealth, setDbHealth] = useState<DatabaseHealthInfo | null>(null);
  const [suiteReport, setSuiteReport] = useState<DiagnosticSuiteReport | null>(
    null,
  );
  const [persistenceState, setPersistenceState] =
    useState<PersistenceProbeState | null>(null);
  const [receiptPreview, setReceiptPreview] =
    useState<FormattedReceiptDocument | null>(null);
  const [isReprintPreview, setIsReprintPreview] = useState<boolean>(false);
  const [printerConnection, setPrinterConnection] =
    useState<PrinterConnectionSnapshot>(() =>
      sharedMockPrinter.getConnectionState(),
    );
  const [mockFailureMode, setMockFailureMode] = useState<MockFailureMode>(() =>
    sharedMockPrinter.getFailureMode(),
  );
  const [lastPrintResult, setLastPrintResult] =
    useState<PrintExecutionResult | null>(null);
  const [printAttempts, setPrintAttempts] = useState<
    readonly PrintAttemptRecord[]
  >([]);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const refreshProbeAndPreview = useCallback(
    async (reprintFlag: boolean) => {
      const probe = await diagnosticRepo.getPersistenceProbeState();
      setPersistenceState(probe);

      if (probe.persistedTransaction) {
        const preview = await receiptService.buildReceiptPreview(
          probe.persistedTransaction.id,
          { isReprint: reprintFlag },
        );
        setReceiptPreview(preview.formatted);
        const attempts = await txRepo.listPrintAttempts(
          probe.persistedTransaction.id,
        );
        setPrintAttempts(attempts);
      } else {
        setReceiptPreview(null);
        setPrintAttempts([]);
      }
      return probe;
    },
    [diagnosticRepo, receiptService, txRepo],
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setIsInitializing(true);
      const health = await databaseService.initialize();
      if (cancelled) {
        return;
      }
      setDbHealth(health);

      if (health.isReady) {
        try {
          const bootNumber = await diagnosticRepo.recordBootSession();
          const probe = await refreshProbeAndPreview(false);
          if (!cancelled) {
            console.info(
              `[MamaMinPOS][P1] SQLite Ready | driver=${health.driverName} | schema=v${String(health.schemaVersion)} | tables=${String(health.tables.length)} | fk=${String(health.foreignKeysEnabled)} | boot=${String(bootNumber)} | persistedSample=${probe.persistedTransaction?.receiptNumber ?? 'NONE'} | survivedRestart=${String(probe.survivedRestart)}`,
            );
          }
        } catch (error) {
          if (!cancelled) {
            setActionFeedback(
              error instanceof Error
                ? error.message
                : 'Gagal memeriksa state persistensi P1.',
            );
          }
        }
      } else {
        console.info(
          `[MamaMinPOS][P1] SQLite Unavailable | code=${health.errorCode ?? 'UNKNOWN'}`,
        );
      }

      if (!cancelled) {
        setIsInitializing(false);
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [diagnosticRepo, refreshProbeAndPreview]);

  const runDiagnosticSuite = useCallback(async () => {
    setIsBusy(true);
    setActionFeedback(null);
    try {
      const report = await diagnosticRepo.runDiagnosticSuite();
      const latestHealth = await databaseService.verifyHealth();
      setSuiteReport(report);
      setDbHealth(latestHealth);
      await refreshProbeAndPreview(isReprintPreview);
      console.info(
        `[MamaMinPOS][P1] DiagnosticSuite | allPassed=${String(report.allPassed)} | checks=${String(report.checks.filter((c) => c.passed).length)}/${String(report.checks.length)}`,
      );
      setActionFeedback(
        report.allPassed
          ? 'Seluruh 8 cek otomatis SQLite (CRUD, FK, CHECK, Rollback, Re-init) LULUS.'
          : 'Terdapat cek diagnostik yang gagal. Periksa rincian di bawah.',
      );
    } catch (error) {
      setActionFeedback(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsBusy(false);
    }
  }, [diagnosticRepo, isReprintPreview, refreshProbeAndPreview]);

  const savePersistenceSample = useCallback(async () => {
    setIsBusy(true);
    setActionFeedback(null);
    try {
      const probe = await diagnosticRepo.ensurePersistenceSampleSale();
      await refreshProbeAndPreview(isReprintPreview);
      console.info(
        `[MamaMinPOS][P1] PersistenceSampleSaved | receipt=${probe.persistedTransaction?.receiptNumber ?? 'NONE'} | createdBoot=${String(probe.probeCreatedBoot)}`,
      );
      setActionFeedback(
        `Sampel persistensi ${probe.persistedTransaction?.receiptNumber ?? ''} tersimpan di SQLite native. Tutup paksa (force-stop) aplikasi lalu buka kembali tanpa internet untuk membuktikan persistensi.`,
      );
    } catch (error) {
      setActionFeedback(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsBusy(false);
    }
  }, [diagnosticRepo, isReprintPreview, refreshProbeAndPreview]);

  const clearDiagnosticData = useCallback(async () => {
    setIsBusy(true);
    setActionFeedback(null);
    try {
      await diagnosticRepo.clearDiagnosticData();
      setLastPrintResult(null);
      await refreshProbeAndPreview(false);
      setIsReprintPreview(false);
      console.info('[MamaMinPOS][P1] DiagnosticDataCleared');
      setActionFeedback(
        'Seluruh data uji berlabel diag_p1_* berhasil dibersihkan dari SQLite.',
      );
    } catch (error) {
      setActionFeedback(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsBusy(false);
    }
  }, [diagnosticRepo, refreshProbeAndPreview]);

  const toggleReprintPreview = useCallback(
    async (reprintFlag: boolean) => {
      setIsReprintPreview(reprintFlag);
      if (persistenceState?.persistedTransaction) {
        const preview = await receiptService.buildReceiptPreview(
          persistenceState.persistedTransaction.id,
          { isReprint: reprintFlag },
        );
        setReceiptPreview(preview.formatted);
      }
    },
    [persistenceState, receiptService],
  );

  const connectMockPrinter = useCallback(async () => {
    setIsBusy(true);
    try {
      const devices = await sharedMockPrinter.listPairedPrinters();
      const firstDevice = devices[0];
      if (!firstDevice) {
        setActionFeedback('Tidak ada perangkat mock yang terdaftar.');
        return;
      }
      const snap = await sharedMockPrinter.connect(firstDevice.address);
      setPrinterConnection(snap);
      setActionFeedback(
        snap.status === 'CONNECTED'
          ? `Terhubung ke ${firstDevice.name} (SIMULASI DEV — bukan printer fisik).`
          : (snap.lastErrorMessage ?? 'Gagal menghubungkan mock printer.'),
      );
    } catch (error) {
      setPrinterConnection(sharedMockPrinter.getConnectionState());
      setActionFeedback(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsBusy(false);
    }
  }, []);

  const disconnectMockPrinter = useCallback(async () => {
    const snap = await sharedMockPrinter.disconnect();
    setPrinterConnection(snap);
    setActionFeedback('Koneksi adapter mock diputuskan.');
  }, []);

  const changeMockFailureMode = useCallback((mode: MockFailureMode) => {
    sharedMockPrinter.setFailureMode(mode);
    setMockFailureMode(mode);
    setActionFeedback(`Mode simulasi gangguan printer disetel ke: ${mode}`);
  }, []);

  const simulatePrintSavedReceipt = useCallback(
    async (reprintFlag: boolean) => {
      if (!persistenceState?.persistedTransaction) {
        setActionFeedback(
          'Simpan sampel transaksi P1 ke SQLite terlebih dahulu sebelum menguji alur struk.',
        );
        return;
      }

      setIsBusy(true);
      try {
        const outcome = await receiptService.printSavedTransaction(
          persistenceState.persistedTransaction.id,
          { isReprint: reprintFlag },
        );
        setReceiptPreview(outcome.formatted);
        setIsReprintPreview(reprintFlag);
        setLastPrintResult(outcome.transmission);
        const attempts = await txRepo.listPrintAttempts(
          persistenceState.persistedTransaction.id,
        );
        setPrintAttempts(attempts);
        setActionFeedback(outcome.transmission.userMessage);
      } catch (error) {
        setActionFeedback(
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        setIsBusy(false);
      }
    },
    [persistenceState, receiptService, txRepo],
  );

  const simulatePrintTestPage = useCallback(async () => {
    setIsBusy(true);
    try {
      const outcome = await receiptService.printTestPage();
      setLastPrintResult(outcome.transmission);
      setActionFeedback(outcome.transmission.userMessage);
    } catch (error) {
      setActionFeedback(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsBusy(false);
    }
  }, [receiptService]);

  return {
    isInitializing,
    isBusy,
    dbHealth,
    suiteReport,
    persistenceState,
    receiptPreview,
    isReprintPreview,
    printerMeta: sharedMockPrinter.getAdapterMetadata(),
    printerConnection,
    mockFailureMode,
    lastPrintResult,
    printAttempts,
    actionFeedback,
    runDiagnosticSuite,
    savePersistenceSample,
    clearDiagnosticData,
    toggleReprintPreview,
    connectMockPrinter,
    disconnectMockPrinter,
    changeMockFailureMode,
    simulatePrintSavedReceipt,
    simulatePrintTestPage,
  };
}

