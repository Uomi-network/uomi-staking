# Test Suite per StakingContract

Questa directory contiene una suite completa di test per il contratto di staking UOMI con funzionalità di incremental staking.

## File di Test

### 1. `Staking.test.js` - Test Principali
Contiene i test fondamentali per tutte le funzionalità del contratto:
- **Deployment**: Verifica inizializzazione corretta
- **Start Staking**: Test per l'avvio del periodo di staking
- **Deposit Window**: Test per la finestra temporale dei depositi
- **Staking**: Test per la funzione di stake (incluso incremental staking)
- **Reward Calculation**: Test per il calcolo delle ricompense
- **Claim**: Test per il ritiro dei token + ricompense
- **Owner Functions**: Test per le funzioni amministrative
- **View Functions**: Test per le funzioni di lettura

### 2. `Staking.incremental.test.js` - Test Incremental Staking
Test dedicati alla nuova funzionalità di incremental staking:
- **Basic Incremental Staking**: Stake multipli durante la deposit window
- **Multiple Users**: Gestione di più utenti con stake incrementali
- **Cap Enforcement**: Test del limite massimo con stake incrementali
- **Time Window Restrictions**: Restrizioni temporali per gli incrementi
- **Reward Calculation**: Calcolo ricompense con stake incrementali
- **Edge Cases**: Casi limite specifici per incremental staking

### 3. `Staking.integration.test.js` - Test di Integrazione
Test per scenari complessi e integrazione completa:
- **Full Staking Cycle**: Ciclo completo con più utenti
- **Maximum Cap Scenarios**: Test del limite massimo di 260M tokens
- **Reward Distribution**: Distribuzione ricompense in scenari complessi
- **Gas Optimization**: Test di performance con molti utenti
- **Security Tests**: Test di sicurezza e reentrancy
- **Time-based Edge Cases**: Test ai confini temporali

### 4. `Staking.errors.test.js` - Test di Errori e Edge Cases
Test per gestione errori e casi limite:
- **Constructor Edge Cases**: Test del costruttore
- **Stake Function Errors**: Errori nella funzione stake
- **Claim Function Errors**: Errori nella funzione claim
- **Owner Function Errors**: Errori nelle funzioni admin
- **Time Manipulation**: Manipolazione del tempo
- **Mathematical Edge Cases**: Casi limite matematici
- **State Consistency**: Consistenza dello stato

## Contratti Mock

### `MockERC20.sol`
Contratto ERC20 mock utilizzato per simulare il token UOMI nei test.

## Come Eseguire i Test

### Eseguire tutti i test
```bash
npx hardhat test
```

### Eseguire test specifici
```bash
# Test principali
npx hardhat test test/Staking.test.js

# Test incremental staking
npx hardhat test test/Staking.incremental.test.js

# Test di integrazione
npx hardhat test test/Staking.integration.test.js

# Test di errori
npx hardhat test test/Staking.errors.test.js
```

### Test con coverage
```bash
npx hardhat coverage
```

### Test con report dettagliato
```bash
npx hardhat test --reporter spec
```

## Scenari Testati

### Funzionalità Base
- ✅ Deployment e inizializzazione
- ✅ Avvio del periodo di staking (solo owner)
- ✅ Stake durante la finestra di deposito (24h)
- ✅ Incremental staking (stake multipli)
- ✅ Calcolo ricompense (15%)
- ✅ Claim dopo periodo di staking (14 giorni)
- ✅ Deposito ricompense da parte dell'owner
- ✅ Ritiro token non utilizzati

### Incremental Staking
- ✅ Stake multipli durante deposit window
- ✅ Emissione eventi corretti (Staked vs StakeIncreased)
- ✅ Un solo inserimento nell'array stakers
- ✅ Calcolo ricompense su importo totale
- ✅ Rispetto del cap con stake incrementali
- ✅ Restrizioni temporali per incrementi

### Vincoli e Limiti
- ✅ Cap massimo di 260M tokens
- ✅ Stake multipli per utente (durante deposit window)
- ✅ Finestra depositi di 24 ore
- ✅ Periodo di staking di 14 giorni
- ✅ Ricompensa fissa del 15%

### Controlli di Sicurezza
- ✅ Reentrancy protection
- ✅ Access control (Ownable)
- ✅ Controlli su bilanci e allowance
- ✅ Validazione input

### Edge Cases
- ✅ Stake di 1 wei
- ✅ Stake massimo (260M tokens)
- ✅ Tempi esatti ai confini
- ✅ Bilanci insufficienti
- ✅ Ricompense parziali
- ✅ Overflow matematici

### Scenari Multi-Utente
- ✅ Più utenti che raggiungono il cap
- ✅ Distribuzione ricompense multiple
- ✅ Claim in ordine diverso
- ✅ Performance con molti stakers

## Costanti di Test

```javascript
const DEPOSIT_WINDOW = 24 * 60 * 60; // 24 ore
const STAKING_DURATION = 14 * 24 * 60 * 60; // 14 giorni
const REWARD_PERCENTAGE = 15; // 15%
const MAX_TOTAL_STAKE = 260_000_000 * 10**18; // 260M tokens
```

## Coverage Obiettivi

La suite di test mira a raggiungere:
- **100% Statement Coverage**: Tutte le righe di codice eseguite
- **100% Branch Coverage**: Tutti i rami condizionali testati
- **100% Function Coverage**: Tutte le funzioni chiamate
- **95%+ Line Coverage**: Quasi tutte le righe coperte

**Status Attuale**: 78/78 test passano (100% success rate)

## Note Tecniche

1. **Time Helpers**: Utilizzo di `@nomicfoundation/hardhat-toolbox/network-helpers` per manipolare il tempo blockchain
2. **Fixtures**: Pattern loadFixture per setup efficiente dei test
3. **Mock Contracts**: MockERC20 per simulare il token con supply aumentata (2B tokens)
4. **Event Testing**: Verifica emissione eventi corretti (Staked, StakeIncreased, Claimed)
5. **Error Testing**: Test per custom errors e revert strings
6. **Gas Testing**: Monitoraggio del consumo gas
7. **Incremental Testing**: Test specifici per stake multipli e gestione stato

## Requisiti

- Node.js >= 16
- Hardhat >= 2.24.2
- @openzeppelin/contracts >= 5.3.0
- @nomicfoundation/hardhat-toolbox >= 5.0.0
