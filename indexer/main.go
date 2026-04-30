package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
	"github.com/gagliardetto/solana-go/rpc/ws"
)

// Program ID on devnet
var programID = solana.MustPublicKeyFromBase58("DFqXUJKoErPKr9mmviuvdys1GZ5nYVrgGYgatX5W2MHf")

const hexagramAccountSize = 56

// HexagramData parsed from on-chain account
type HexagramData struct {
	Address     string `json:"address"`
	Owner       string `json:"owner"`
	Yaos        []int  `json:"yaos"`
	DerivedYaos []int  `json:"derivedYaos"`
	Flipped     bool   `json:"flipped"`
	Slot        uint64 `json:"slot"`
}

// Store holds indexed hexagrams
type Store struct {
	mu        sync.RWMutex
	hexagrams map[string]*HexagramData // keyed by account address
	byOwner   map[string][]string      // owner -> list of account addresses
}

func NewStore() *Store {
	return &Store{
		hexagrams: make(map[string]*HexagramData),
		byOwner:   make(map[string][]string),
	}
}

func (s *Store) Put(h *HexagramData) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.hexagrams[h.Address] = h
	s.byOwner[h.Owner] = appendUnique(s.byOwner[h.Owner], h.Address)
}

func (s *Store) GetByAddress(addr string) *HexagramData {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.hexagrams[addr]
}

func (s *Store) GetByOwner(owner string) []*HexagramData {
	s.mu.RLock()
	defer s.mu.RUnlock()
	addrs := s.byOwner[owner]
	result := make([]*HexagramData, 0, len(addrs))
	for _, a := range addrs {
		if h, ok := s.hexagrams[a]; ok {
			result = append(result, h)
		}
	}
	return result
}

func (s *Store) All() []*HexagramData {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*HexagramData, 0, len(s.hexagrams))
	for _, h := range s.hexagrams {
		result = append(result, h)
	}
	return result
}

func appendUnique(slice []string, s string) []string {
	for _, v := range slice {
		if v == s {
			return slice
		}
	}
	return append(slice, s)
}

// ParseHexagramData parses the 56-byte account data
func ParseHexagramData(addr string, data []byte, slot uint64) *HexagramData {
	if len(data) < hexagramAccountSize {
		return nil
	}

	// Verify discriminator: "ZHOUYI\0\1"
	disc := data[0:8]
	if disc[0] != 0x5a || disc[1] != 0x48 || disc[2] != 0x4f || disc[3] != 0x55 ||
		disc[4] != 0x59 || disc[5] != 0x49 || disc[6] != 0x00 || disc[7] != 0x01 {
		return nil
	}

	owner := solana.PublicKeyFromBytes(data[8:40])

	yaos := make([]int, 6)
	for i := 0; i < 6; i++ {
		yaos[i] = int(data[40+i])
	}

	derivedYaos := make([]int, 6)
	for i := 0; i < 6; i++ {
		derivedYaos[i] = int(data[46+i])
	}

	flipped := data[52] != 0

	return &HexagramData{
		Address:     addr,
		Owner:       owner.String(),
		Yaos:        yaos,
		DerivedYaos: derivedYaos,
		Flipped:     flipped,
		Slot:        slot,
	}
}

func main() {
	rpcURL := os.Getenv("SOLANA_RPC_URL")
	if rpcURL == "" {
		rpcURL = "https://api.devnet.solana.com"
	}
	wsURL := os.Getenv("SOLANA_WS_URL")
	if wsURL == "" {
		wsURL = "wss://api.devnet.solana.com"
	}
	httpAddr := os.Getenv("INDEXER_ADDR")
	if httpAddr == "" {
		httpAddr = ":8080"
	}

	store := NewStore()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initial fetch of all program accounts
	rpcClient := rpc.New(rpcURL)
	log.Printf("Fetching existing hexagram accounts...")
	fetchExisting(ctx, rpcClient, store)

	// Start WebSocket subscriber
	go subscribeToChanges(ctx, wsURL, store)

	// Start HTTP API
	mux := http.NewServeMux()
	mux.HandleFunc("/api/hexagrams", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		owner := r.URL.Query().Get("owner")
		var data []*HexagramData
		if owner != "" {
			data = store.GetByOwner(owner)
		} else {
			data = store.All()
		}
		json.NewEncoder(w).Encode(data)
	})

	mux.HandleFunc("/api/hexagram/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		addr := r.URL.Path[len("/api/hexagram/"):]
		h := store.GetByAddress(addr)
		if h == nil {
			http.Error(w, `{"error":"not found"}`, 404)
			return
		}
		json.NewEncoder(w).Encode(h)
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	log.Printf("Indexer API listening on %s", httpAddr)

	go func() {
		if err := http.ListenAndServe(httpAddr, mux); err != nil {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	log.Println("Shutting down...")
	cancel()
}

func fetchExisting(ctx context.Context, client *rpc.Client, store *Store) {
	// Use GetProgramAccounts to fetch all hexagram accounts
	opts := &rpc.GetProgramAccountsOpts{
		Filters: []rpc.RPCFilter{
			{DataSize: hexagramAccountSize},
		},
		Encoding: solana.EncodingBase64,
	}
	resp, err := client.GetProgramAccountsWithOpts(
		ctx,
		programID,
		opts,
	)
	if err != nil {
		log.Printf("Warning: failed to fetch program accounts: %v", err)
		return
	}

	for _, acct := range resp {
		if acct.Account == nil || acct.Account.Data == nil {
			continue
		}
		data := acct.Account.Data.GetBinary()
		if len(data) == 0 {
			continue
		}
		addr := acct.Pubkey.String()
		if h := ParseHexagramData(addr, data, 0); h != nil {
			store.Put(h)
			log.Printf("Indexed hexagram %s (owner: %s)", addr, h.Owner)
		}
	}

	log.Printf("Indexed %d existing hexagrams", len(store.All()))
}

func subscribeToChanges(ctx context.Context, wsURL string, store *Store) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		err := subscribeOnce(ctx, wsURL, store)
		if err != nil {
			log.Printf("WebSocket error: %v, reconnecting in 3s...", err)
			time.Sleep(3 * time.Second)
		}
	}
}

func subscribeOnce(ctx context.Context, wsURL string, store *Store) error {
	client, err := ws.Connect(ctx, wsURL)
	if err != nil {
		return fmt.Errorf("ws connect: %w", err)
	}
	defer client.Close()

	// Subscribe to program account changes
	sub, err := client.ProgramSubscribeWithOpts(
		programID,
		rpc.CommitmentConfirmed,
		solana.EncodingBase64,
		[]rpc.RPCFilter{
			{DataSize: hexagramAccountSize},
		},
	)
	if err != nil {
		return fmt.Errorf("program subscribe: %w", err)
	}
	defer sub.Unsubscribe()

	log.Printf("Subscribed to program account changes")

	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		got, err := sub.Recv(ctx)
		if err != nil {
			return fmt.Errorf("recv: %w", err)
		}

		if got.Value.Account == nil || got.Value.Account.Data == nil {
			continue
		}
		addr := got.Value.Pubkey.String()
		data := got.Value.Account.Data.GetBinary()
		slot := got.Context.Slot
		if h := ParseHexagramData(addr, data, slot); h != nil {
			store.Put(h)
			log.Printf("Updated hexagram %s (owner: %s, flipped: %v)", addr, h.Owner, h.Flipped)
		}
	}
}
